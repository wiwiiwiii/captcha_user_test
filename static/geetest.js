// static/geetest.js - 自动计数版

const GT_ID = GEETEST_ID;
const CAPTCHA_TYPE = TEST_TYPE;
const TOTAL_ROUNDS = 20;

let currentRound = 0;
let startTime = 0;
let timerInterval = null;
let captchaObj = null;

// 新增：自动记录尝试次数 (默认1次，即最后成功那一次)
// 逻辑：总尝试次数 = 失败次数 + 1(成功)
let failCounts = 0;

// DOM 元素
const btnStart = document.getElementById('btn-start');
const btnSkip = document.getElementById('btn-skip');
const setupArea = document.getElementById('setup-area');
const experimentArea = document.getElementById('experiment-area');
const captchaWrapper = document.getElementById('geetest-box');
const msgDisplay = document.getElementById('msg');
const timerDisplay = document.getElementById('timer-display');
const countDisplay = document.getElementById('current-count');
// 弹窗不再需要，但保留 DOM 引用防止报错（或者直接无视）

if(btnStart) btnStart.addEventListener('click', startExperiment);
if(btnSkip) btnSkip.addEventListener('click', userGiveUp);

function startExperiment() {
    const userIdInput = document.getElementById('user-id');
    const userId = userIdInput ? userIdInput.value.trim() : "test";
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
    msgDisplay.innerText = "Loading Geetest...";
    btnSkip.style.display = 'none';
    timerDisplay.innerText = "0.00 s";

    // 关键：重置失败计数器
    failCounts = 0;

    captchaWrapper.innerHTML = '';

    initGeetest4({
        captchaId: GT_ID,
        product: 'float'
    }, function (captcha) {
        captchaObj = captcha;
        captcha.appendTo("#geetest-box");

        captcha.onReady(function(){
            msgDisplay.innerText = "Please solve the challenge...";
            startTimer();
        })
        .onSuccess(function(){
            // === 【修改点】成功后直接提交，不弹窗 ===
            clearInterval(timerInterval);

            // 计算总尝试次数：失败次数 + 1次成功
            const totalAttempts = failCounts + 1;

            // 获取验证结果
            const result = captchaObj.getValidate();

            // 直接提交
            const duration = Date.now() - startTime;
            submitData('SUCCESS', duration, result, totalAttempts);
        })
        .onFail(function(e) {
            // === 【修改点】监听失败事件 ===
            // 当用户拼图错误、点选错误时触发
            failCounts++;
            console.log("User failed an attempt. Current fail count:", failCounts);
        })
        .onError(function(e){
            console.error("Geetest Network Error:", e);
            msgDisplay.innerText = "Error loading. Please refresh.";
            btnSkip.style.display = 'inline-block';
        });
    });
}

function startTimer() {
    startTime = Date.now();
    btnSkip.style.display = 'inline-block';
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        const seconds = (Date.now() - startTime) / 1000;
        timerDisplay.innerText = seconds.toFixed(2) + " s";
    }, 50);
}

// 注意：window.confirmAttempts 函数已经不需要了，可以删掉

function userGiveUp() {
    clearInterval(timerInterval);
    const duration = Date.now() - startTime;
    // 放弃时，尝试次数记为 failCounts (因为没有那次成功的 +1)
    const attempts = failCounts > 0 ? failCounts : 1;
    submitData('GIVE_UP', duration, null, attempts);
}

function submitData(status, duration, gtResult, attempts) {
    msgDisplay.innerText = "Saving data...";
    const userId = document.getElementById('user-id').value;

    const payload = {
        captcha_type: CAPTCHA_TYPE,
        user_id: userId,
        round_number: currentRound + 1,
        duration_ms: duration,
        status: status,
        attempts: attempts // 这里现在传的是自动计算的值
    };

    if (gtResult) {
        payload.lot_number = gtResult.lot_number;
        payload.captcha_output = gtResult.captcha_output;
        payload.pass_token = gtResult.pass_token;
        payload.gen_time = gtResult.gen_time;
        // 注意：这里不需要手动传 captcha_id，后端会根据路由类型自动补全
    }

    fetch('/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            currentRound++;
            countDisplay.innerText = currentRound;
            if(captchaObj && captchaObj.destroy) captchaObj.destroy();
            setTimeout(loadNextRound, 1000);
        } else {
            alert("Save failed: " + JSON.stringify(data));
        }
    })
    .catch(err => console.error(err));
}

function finishStudy() {
    experimentArea.classList.add('hidden');
    document.getElementById('done-msg').classList.remove('hidden');
}