import os
import csv
import time
import hmac
import hashlib
import requests
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv

# 1. 加载环境变量
load_dotenv()

app = Flask(__name__)

# ================= 配置区域 =================

# --- Google reCAPTCHA v2 ---
GOOGLE_SITE_KEY = os.getenv('GOOGLE_SITE_KEY')
GOOGLE_SECRET_KEY = os.getenv('GOOGLE_SECRET_KEY')
GOOGLE_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'

# --- hCaptcha ---
HCAPTCHA_SITE_KEY = os.getenv('HCAPTCHA_SITE_KEY')
HCAPTCHA_SECRET_KEY = os.getenv('HCAPTCHA_SECRET_KEY')
HCAPTCHA_VERIFY_URL = 'https://hcaptcha.com/siteverify'

# --- Geetest (极验 v4) ---
# 五子棋 (Gobang)
GT_GOBANG_ID = os.getenv('GEETEST_GOBANG_ID')
GT_GOBANG_KEY = os.getenv('GEETEST_GOBANG_KEY')

# 图标点选 (IconCrush)
GT_ICON_ID = os.getenv('GEETEST_ICON_ID')
GT_ICON_KEY = os.getenv('GEETEST_ICON_KEY')

# Geetest 验证接口
GT_VERIFY_URL = "http://gcaptcha4.geetest.com/validate"

# 数据记录文件
LOG_FILE = 'user_study_data.csv'


# ===========================================

def init_log():
    """初始化 CSV 文件"""
    if not os.path.exists(LOG_FILE):
        try:
            with open(LOG_FILE, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                writer.writerow([
                    'user_id',
                    'captcha_type',  # 验证码类型
                    'timestamp',
                    'round_number',
                    'status',
                    'duration_ms',
                    'attempts',  # 用户自报尝试次数
                    'server_response'  # 后端校验结果
                ])
            print(f"[*] Created log file: {LOG_FILE}")
        except Exception as e:
            print(f"[!] Init log error: {e}")


# 启动时初始化
init_log()


# ================= 页面路由 (View Controller) =================

@app.route('/')
def menu():
    """主菜单"""
    return render_template('menu.html')


@app.route('/test/recaptcha')
def test_recaptcha():
    """Google 测试页"""
    return render_template('recaptcha.html', site_key=GOOGLE_SITE_KEY)


@app.route('/test/hcaptcha')
def test_hcaptcha():
    """hCaptcha 测试页"""
    return render_template('hcaptcha.html', site_key=HCAPTCHA_SITE_KEY)


@app.route('/test/geetest/gobang')
def test_geetest_gobang():
    """Geetest 五子棋测试页"""
    return render_template('geetest.html',
                           page_title="Geetest Gobang",
                           gt_id=GT_GOBANG_ID,
                           test_type="geetest_gobang")


@app.route('/test/geetest/icon')
def test_geetest_icon():
    """Geetest 图标点选测试页"""
    return render_template('geetest.html',
                           page_title="Geetest IconCrush",
                           gt_id=GT_ICON_ID,
                           test_type="geetest_icon")


# ================= 数据接口 (Data Controller) =================

@app.route('/record', methods=['POST'])
def record_result():
    data = request.json

    # 基础字段
    captcha_type = data.get('captcha_type', 'unknown')
    user_id = data.get('user_id', 'anonymous')
    round_num = data.get('round_number', 0)
    duration = data.get('duration_ms', 0)
    status = data.get('status', 'UNKNOWN')
    token = data.get('token')  # Google/hCaptcha 的 token
    attempts = data.get('attempts', 1)

    # Geetest 特有字段
    gt_lot_number = data.get('lot_number')
    gt_captcha_output = data.get('captcha_output')
    gt_pass_token = data.get('pass_token')
    gt_gen_time = data.get('gen_time')

    server_response_str = "N/A"

    # --- 后端二次校验逻辑 ---
    # 只有前端成功(SUCCESS)且有校验数据时，才去向第三方服务器查询
    if status == 'SUCCESS':
        try:
            # 1. Google reCAPTCHA
            if captcha_type == 'google_v2':
                payload = {'secret': GOOGLE_SECRET_KEY, 'response': token}
                r = requests.post(GOOGLE_VERIFY_URL, data=payload, timeout=10)
                result = r.json()
                server_response_str = str(result)
                if not result.get('success'):
                    status = 'VERIFY_FAILED'

            # 2. hCaptcha
            elif captcha_type == 'hcaptcha':
                payload = {'secret': HCAPTCHA_SECRET_KEY, 'response': token}
                r = requests.post(HCAPTCHA_VERIFY_URL, data=payload, timeout=10)
                result = r.json()
                server_response_str = str(result)
                if not result.get('success'):
                    status = 'VERIFY_FAILED'

            # 3. Geetest (v4)
            elif captcha_type.startswith('geetest_'):
                # 【修改 1】同时获取当前的 Key 和 ID
                if 'gobang' in captcha_type:
                    current_id = GT_GOBANG_ID  # <--- 新增
                    current_key = GT_GOBANG_KEY
                else:
                    current_id = GT_ICON_ID  # <--- 新增
                    current_key = GT_ICON_KEY

                # 2. 生成签名 (保持不变)
                sign_token = hmac.new(
                    current_key.encode('utf-8'),
                    gt_lot_number.encode('utf-8'),
                    digestmod=hashlib.sha256
                ).hexdigest()

                # 3. 构造请求
                payload = {
                    "captcha_id": current_id,  # <--- 【修改 2】必须加上这一行！
                    "lot_number": gt_lot_number,
                    "captcha_output": gt_captcha_output,
                    "pass_token": gt_pass_token,
                    "gen_time": gt_gen_time,
                    "sign_token": sign_token
                }

                # 打印调试信息 (可选)
                # print(f"\n[DEBUG] 发送 Payload: {payload}")

                r = requests.post(GT_VERIFY_URL, data=payload, timeout=10)
                result = r.json()
                server_response_str = str(result)

                if result.get('result') != 'success':
                    status = 'VERIFY_FAILED'

        except Exception as e:
            print(f"[!] Verification Error: {e}")
            server_response_str = f"NetErr: {str(e)}"
            # 如果是网络原因导致后端无法连接 Google/Geetest，标记为服务器错误
            status = 'SERVER_NET_ERROR'

    # --- 写入 CSV ---
    try:
        with open(LOG_FILE, 'a', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                user_id,
                captcha_type,
                time.strftime("%Y-%m-%d %H:%M:%S", time.localtime()),
                round_num,
                status,
                duration,
                attempts,
                server_response_str
            ])
        return jsonify({'success': True})
    except Exception as e:
        print(f"[!] Write CSV Error: {e}")
        return jsonify({'success': False, 'msg': 'Write Error'})


if __name__ == '__main__':
    # 开启 debug 模式，允许局域网访问 (host='0.0.0.0')
    app.run(debug=True, host='0.0.0.0', port=5000)