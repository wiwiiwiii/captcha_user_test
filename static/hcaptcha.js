// --- 配置区 ---
const SITE_KEY = GLOBAL_SITE_KEY; // 读取 HTML 里的变量
const TOTAL_ROUNDS = 20;

// --- 变量 ---
let currentRound = 0;
let startTime = 0;
let timerInterval = null;
let widgetId = null;
let tempToken = null; // 临时存 Token

// --- DOM 引用 ---
const btnStart = document.getElementById('btn-start');
const btnSkip = document.getElementById('btn-skip');
const setupArea = document.getElementById('setup-area');
const experimentArea = document.getElementById('experiment-area');
const captchaWrapper = document.getElementById('h-captcha-box');
const msgDisplay = document.getElementById('msg');
const timerDisplay = document.getElementById('timer-display');
const countDisplay = document.getElementById('current-count');
const modalOverlay = document.getElementById('modal-overlay');

// --- 事件 ---
btnStart.addEventListener('click', startExperiment);
btnSkip.addEventListener('click', userGiveUp);

function startExperiment() {
    const userId = document.getElementById('user-id').value.trim();
    if (!userId) { alert("Please enter User ID"); return; }

    setupArea.classList.add('hidden');
    experimentArea.classList.remove('hidden');
    document.getElementById('total-target').innerText = TOTAL_ROUNDS;
    loadNextRound();
}

function loadNextRound() {
    if (currentRound >= TOTAL_ROUNDS) {
        finishStudy();
        return;
    }

    // 重置状态
    msgDisplay.innerText = "Loading hcaptcha...";
    btnSkip.style.display = 'none';
    timerDisplay.innerText = "0.00 s";
    modalOverlay.classList.add('hidden'); // 确保弹窗关闭

    // 销毁旧验证码，强制刷新上下文
    captchaWrapper.innerHTML = '';

    setTimeout(() => {
        const newDiv = document.createElement('div');
        newDiv.id = 'dynamic-hcaptcha';
        captchaWrapper.appendChild(newDiv);

        try {
            widgetId = hcaptcha.render('dynamic-hcaptcha', {
                'sitekey': SITE_KEY,
                'callback': onVerifySuccess,  // 成功回调
                'expired-callback': onExpired,
                'error-callback': onError,
                'theme': 'light',
                'size': 'normal' // 移动端适配
            });
            setTimeout(startTimer, 200);
        } catch (e) {
            console.error(e);
            msgDisplay.innerText = "Error loading component.";
        }
    }, 500);
}

function startTimer() {
    startTime = Date.now();
    btnSkip.style.display = 'inline-block';
    msgDisplay.innerText = "Please solve the challenge...";

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const seconds = (Date.now() - startTime) / 1000;
        timerDisplay.innerText = seconds.toFixed(2) + " s";
    }, 50);
}

// === 核心逻辑修改 ===

// 1. Google 说用户通过了
function onVerifySuccess(token) {
    clearInterval(timerInterval); // 立刻停止计时
    tempToken = token;            // 保存 Token

    // 弹出询问框，不直接提交
    modalOverlay.classList.remove('hidden');
}

// 2. 用户在弹窗里点击了次数 (全局函数供HTML调用)
window.confirmAttempts = function(attempts) {
    // 隐藏弹窗
    modalOverlay.classList.add('hidden');

    // 计算耗时（截止到 verify 成功那一刻，不包含思考弹窗的时间）
    const duration = Date.now() - startTime;

    // 提交数据
    submitData('SUCCESS', duration, tempToken, attempts);
}

// 3. 用户跳过
function userGiveUp() {
    clearInterval(timerInterval);
    const duration = Date.now() - startTime;
    // 放弃记为 0 次，方便后续剔除
    submitData('GIVE_UP', duration, null, 0);
}

function submitData(status, duration, token, attempts) {
    msgDisplay.innerText = "Saving data...";
    const userId = document.getElementById('user-id').value;

    fetch('/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            captcha_type: 'hcaptcha', // <--- 【新增】身份标记
            user_id: userId,
            round_number: currentRound + 1,
            duration_ms: duration,
            status: status,
            token: token,
            attempts: attempts
        })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                currentRound++;
                countDisplay.innerText = currentRound;
                setTimeout(loadNextRound, 1000); // 间隔1秒进下一轮
            } else {
                alert("Save failed: " + JSON.stringify(data));
            }
        })
        .catch(err => {
            console.error(err);
            alert("Network Error");
        });
}

function onExpired() { msgDisplay.innerText = "Token expired. Please click again."; }
function onError() {
    msgDisplay.innerText = "Connection Failed. Check VPN.";
    btnSkip.style.display = 'inline-block';
}
function finishStudy() {
    experimentArea.classList.add('hidden');
    document.getElementById('done-msg').classList.remove('hidden');
}
