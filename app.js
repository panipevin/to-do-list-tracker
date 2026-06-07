// Setup Default Task Templates Structure
const defaultStructure = [
    { id: 'wakeup', text: '1. Wake up time', type: 'time', val: '07:00' },
    { id: 'exercise', text: '2. Exercise', type: 'check', val: false },
    { id: 'water', text: '3. How many lit of water', type: 'number', val: 0 },
    { id: 'breakfast', text: '4. Breakfast', type: 'check', val: false },
    { id: 'lunch', text: '5. Lunch', type: 'check', val: false },
    { id: 'dinner', text: '6. Dinner', type: 'check', val: false },
    { id: 'sleeping', text: '7. Sleeping time', type: 'time', val: '22:00' }
];

let activeTargetUser = ''; 
let currentDateString = '';

document.addEventListener('DOMContentLoaded', () => {
    // Lock default to current local date
    const today = new Date();
    currentDateString = today.toISOString().split('T')[0];
    
    const dateInput = document.getElementById('history-date');
    dateInput.value = currentDateString;
    
    // Register calendar picker logic
    dateInput.addEventListener('change', (e) => {
        currentDateString = e.target.value;
        loadDayData();
    });

    loadDayData();
    startMidnightTimer();
});

// Primary day parser
function loadDayData() {
    let dayRecords = localStorage.getItem(`day_record_${currentDateString}`);
    
    if (!dayRecords) {
        // Build crisp initialization maps if date doesn't exist
        dayRecords = {
            user1: { saved: false, tasks: JSON.parse(JSON.stringify(defaultStructure)) },
            user2: { saved: false, tasks: JSON.parse(JSON.stringify(defaultStructure)) }
        };
        localStorage.setItem(`day_record_${currentDateString}`, JSON.stringify(dayRecords));
    } else {
        dayRecords = JSON.parse(dayRecords);
    }

    renderUserDOM('user1', dayRecords.user1);
    renderUserDOM('user2', dayRecords.user2);
    evaluateWinner(dayRecords);
}

function renderUserDOM(userKey, userData) {
    const container = document.getElementById(`${userKey}-todo-list`);
    container.innerHTML = '';

    userData.tasks.forEach((task, idx) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'todo-item';
        itemRow.id = `${userKey}-row-${task.id}`;

        const leftSide = document.createElement('div');
        leftSide.className = 'item-left';

        // Check if item element needs checkbox or custom entry field
        if (task.type === 'check') {
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = task.val;
            chk.disabled = userData.saved; // lock when verified
            chk.addEventListener('change', () => {
                updateTaskValue(userKey, idx, chk.checked);
            });
            leftSide.appendChild(chk);
        }

        const labelText = document.createElement('span');
        labelText.textContent = task.text;
        leftSide.appendChild(labelText);
        itemRow.appendChild(leftSide);

        // Append explicit metric fields right aligned
        if (task.type !== 'check') {
            const inputField = document.createElement('input');
            inputField.className = 'input-val';
            inputField.value = task.val;
            inputField.disabled = userData.saved;

            if (task.type === 'time') inputField.type = 'time';
            if (task.type === 'number') {
                inputField.type = 'number';
                inputField.step = '0.1';
            }

            inputField.addEventListener('change', () => {
                let formattedVal = inputField.value;
                if (task.type === 'number') formattedVal = parseFloat(inputField.value) || 0;
                updateTaskValue(userKey, idx, formattedVal);
            });

            itemRow.appendChild(inputField);
        }

        container.appendChild(itemRow);
    });

    // Run custom rule calculations
    calculateMetrics(userKey, userData.tasks);
}

function updateTaskValue(userKey, taskIdx, newVal) {
    const data = JSON.parse(localStorage.getItem(`day_record_${currentDateString}`));
    data[userKey].tasks[taskIdx].val = newVal;
    localStorage.setItem(`day_record_${currentDateString}`, JSON.stringify(data));
    calculateMetrics(userKey, data[userKey].tasks);
}

// Math Engines for Sleep Metrics and Water Volumes
function calculateMetrics(userKey, tasks) {
    const waterTask = tasks.find(t => t.id === 'water');
    const wakeupTask = tasks.find(t => t.id === 'wakeup');
    const sleepTask = tasks.find(t => t.id === 'sleeping');

    // Water highlight assessment
    const waterRow = document.getElementById(`${userKey}-row-water`);
    const waterStatus = document.getElementById(`${userKey}-water-status`);
    if(waterTask && waterRow) {
        waterStatus.textContent = `${waterTask.val} / 3 Liters`;
        if (waterTask.val < 3) {
            waterRow.classList.add('highlight-red');
        } else {
            waterRow.classList.remove('highlight-red');
        }
    }

    // Sleep evaluation logic engine
    if (wakeupTask && sleepTask) {
        const sleepHours = computeSleepDuration(sleepTask.val, wakeupTask.val);
        document.getElementById(`${userKey}-sleep-status`).textContent = `${sleepHours.toFixed(1)} hours`;

        const sleepRow = document.getElementById(`${userKey}-row-sleeping`);
        const wakeupRow = document.getElementById(`${userKey}-row-wakeup`);

        if(sleepRow && wakeupRow) {
            // Reset tags
            sleepRow.classList.remove('highlight-red', 'highlight-yellow');
            wakeupRow.classList.remove('highlight-red', 'highlight-yellow');

            if (sleepHours < 7) {
                sleepRow.classList.add('highlight-red');
                wakeupRow.classList.add('highlight-red');
            } else if (sleepHours > 7) {
                sleepRow.classList.add('highlight-yellow');
                wakeupRow.classList.add('highlight-yellow');
            }
        }
    }
}

function computeSleepDuration(sleepTime, wakeTime) {
    if (!sleepTime || !wakeTime) return 0;
    const [sH, sM] = sleepTime.split(':').map(Number);
    const [wH, wM] = wakeTime.split(':').map(Number);

    let sleepDate = new Date(2020, 0, 1, sH, sM);
    let wakeDate = new Date(2020, 0, 2, wH, wM); // Assumed wake up next calendar day

    let differenceMs = wakeDate - sleepDate;
    let hours = differenceMs / (1000 * 60 * 60);
    
    if (hours > 24) hours -= 24; // Correction if early sleeper
    return hours;
}

// Dialog window controllers
function openAddModal(userKey) {
    activeTargetUser = userKey;
    document.getElementById('custom-task-modal').style.display = 'flex';
    document.getElementById('modal-submit-btn').onclick = saveCustomTask;
}

function closeAddModal() {
    document.getElementById('custom-task-modal').style.display = 'none';
    document.getElementById('custom-task-name').value = '';
}

function saveCustomTask() {
    const textStr = document.getElementById('custom-task-name').value.trim();
    if (!textStr) return;

    const data = JSON.parse(localStorage.getItem(`day_record_${currentDateString}`));
    const newId = 'custom_' + Date.now();
    
    data[activeTargetUser].tasks.push({
        id: newId,
        text: textStr,
        type: 'check',
        val: false
    });

    localStorage.setItem(`day_record_${currentDateString}`, JSON.stringify(data));
    loadDayData();
    closeAddModal();
}

// Individual confirmation routine saves
function manualSave(userKey) {
    const data = JSON.parse(localStorage.getItem(`day_record_${currentDateString}`));
    data[userKey].saved = true;
    localStorage.setItem(`day_record_${currentDateString}`, JSON.stringify(data));
    
    alert(`Data successfully locked and submitted for validation!`);
    loadDayData();
}

// Automated Cron backup execution at 12:00 Midnight
function startMidnightTimer() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    const msUntilMidnight = midnight - now;

    setTimeout(() => {
        autoSaveAll();
        // Recur dynamically
        setInterval(autoSaveAll, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
}

function autoSaveAll() {
    const data = JSON.parse(localStorage.getItem(`day_record_${currentDateString}`));
    if(data) {
        data.user1.saved = true;
        data.user2.saved = true;
        localStorage.setItem(`day_record_${currentDateString}`, JSON.stringify(data));
        loadDayData();
    }
}

// Leaderboard engine computation block
function evaluateWinner(dayData) {
    const banner = document.getElementById('daily-winner-banner');
    
    if (!dayData.user1.saved || !dayData.user2.saved) {
        banner.className = "winner-banner";
        banner.textContent = "Waiting for both profiles to submit records...";
        return;
    }

    let u1Score = calculateScore(dayData.user1.tasks);
    let u2Score = calculateScore(dayData.user2.tasks);

    if (u1Score > u2Score) {
        banner.className = "winner-banner highlight-yellow";
        banner.textContent = `👑 My Space Wins Today! (Score: ${u1Score} vs ${u2Score})`;
    } else if (u2Score > u1Score) {
        banner.className = "winner-banner highlight-yellow";
        banner.textContent = `👑 Her Space Wins Today! (Score: ${u2Score} vs ${u1Score})`;
    } else {
        banner.className = "winner-banner";
        banner.textContent = `🤝 It's a Perfect Tie! (Score: ${u1Score} vs ${u2Score})`;
    }
}

function calculateScore(tasks) {
    let score = 0;
    tasks.forEach(t => {
        if (t.type === 'check' && t.val === true) score++;
        if (t.id === 'water' && t.val >= 3) score++;
        if (t.id === 'sleeping') {
            const wakeup = tasks.find(tk => tk.id === 'wakeup');
            const hrs = computeSleepDuration(t.val, wakeup.val);
            if (hrs >= 7) score++; // Reward healthy lifestyle habits
        }
    });
    return score;
}