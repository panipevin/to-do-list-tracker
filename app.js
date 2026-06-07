// --- 1. CONNECT TO YOUR BACKEND DATABASE ---
const SUPABASE_URL = 'YOUR_SUPABASE_URL'; 
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabase = sb.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- 2. THE CHOSEN TEMPLATE ---
const defaultStructure = [
    { id: 'wakeup', text: '1. Wake up time', type: 'time', val: '07:00' },
    { id: 'exercise', text: '2. Exercise', type: 'check', val: false },
    { id: 'water', text: '3. How many lit of water', type: 'number', val: 0 },
    { id: 'breakfast', text: '4. Breakfast', type: 'check', val: false },
    { id: 'lunch', text: '5. Lunch', type: 'check', val: false },
    { id: 'dinner', text: '6. Dinner', type: 'check', val: false },
    { id: 'sleeping', text: '7. Sleeping time', type: 'time', val: '22:00' }
];

let currentDateString = '';
let localCacheData = null; // Holds the live state locally

document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    currentDateString = today.toISOString().split('T')[0];
    
    const dateInput = document.getElementById('history-date');
    dateInput.value = currentDateString;
    
    dateInput.addEventListener('change', (e) => {
        currentDateString = e.target.value;
        loadDayData();
    });

    loadDayData();
    startMidnightTimer();
});

// --- 3. FETCH DATA FROM BACKEND CLOUD ---
async function loadDayData() {
    // Look up the specific chosen date row in your database table
    let { data: record, error } = await supabase
        .from('daily_records')
        .select('*')
        .eq('date_string', currentDateString)
        .single();

    if (error && error.code === 'PGRST116') {
        // Record doesn't exist yet for this day, generate a fresh row structure
        localCacheData = {
            user1: { saved: false, tasks: JSON.parse(JSON.stringify(defaultStructure)) },
            user2: { saved: false, tasks: JSON.parse(JSON.stringify(defaultStructure)) }
        };
        // Push the new day to your database cloud row
        await supabase.from('daily_records').insert([
            { 
                date_string: currentDateString,
                user1_saved: false,
                user1_tasks: localCacheData.user1.tasks,
                user2_saved: false,
                user2_tasks: localCacheData.user2.tasks
            }
        ]);
    } else {
        // Row exists! Map backend records into browser screen layouts
        localCacheData = {
            user1: { saved: record.user1_saved, tasks: record.user1_tasks },
            user2: { saved: record.user2_saved, tasks: record.user2_tasks }
        };
    }

    renderUserDOM('user1', localCacheData.user1);
    renderUserDOM('user2', localCacheData.user2);
    evaluateWinner(localCacheData);
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

        if (task.type === 'check') {
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = task.val;
            chk.disabled = userData.saved; 
            chk.addEventListener('change', () => {
                updateTaskValue(userKey, idx, chk.checked);
            });
            leftSide.appendChild(chk);
        }

        const labelText = document.createElement('span');
        labelText.textContent = task.text;
        leftSide.appendChild(labelText);
        itemRow.appendChild(leftSide);

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

    calculateMetrics(userKey, userData.tasks);
}

// --- 4. STREAM CHANGES LIVE TO BACKEND CLOUD ---
async function updateTaskValue(userKey, taskIdx, newVal) {
    localCacheData[userKey].tasks[taskIdx].val = newVal;
    calculateMetrics(userKey, localCacheData[userKey].tasks);

    // Patch change straight up to your Supabase tables
    const updatePayload = {};
    updatePayload[`${userKey}_tasks`] = localCacheData[userKey].tasks;

    await supabase
        .from('daily_records')
        .update(updatePayload)
        .eq('date_string', currentDateString);
}

// --- 5. SYSTEM MANIFOLD CALCULATIONS ---
function calculateMetrics(userKey, tasks) {
    const waterTask = tasks.find(t => t.id === 'water');
    const wakeupTask = tasks.find(t => t.id === 'wakeup');
    const sleepTask = tasks.find(t => t.id === 'sleeping');

    const waterRow = document.getElementById(`${userKey}-row-water`);
    const waterStatus = document.getElementById(`${userKey}-water-status`);
    if(waterTask && waterRow) {
        waterStatus.textContent = `${waterTask.val} / 3 Liters`;
        if (waterTask.val < 3) waterRow.className = 'todo-item highlight-red';
        else waterRow.className = 'todo-item';
    }

    if (wakeupTask && sleepTask) {
        const sleepHours = computeSleepDuration(sleepTask.val, wakeupTask.val);
        document.getElementById(`${userKey}-sleep-status`).textContent = `${sleepHours.toFixed(1)} hours`;

        const sleepRow = document.getElementById(`${userKey}-row-sleeping`);
        const wakeupRow = document.getElementById(`${userKey}-row-wakeup`);

        if(sleepRow && wakeupRow) {
            if (sleepHours < 7) {
                sleepRow.className = 'todo-item highlight-red';
                wakeupRow.className = 'todo-item highlight-red';
            } else if (sleepHours > 7) {
                sleepRow.className = 'todo-item highlight-yellow';
                wakeupRow.className = 'todo-item highlight-yellow';
            } else {
                sleepRow.className = 'todo-item';
                wakeupRow.className = 'todo-item';
            }
        }
    }
}

function computeSleepDuration(sleepTime, wakeTime) {
    if (!sleepTime || !wakeTime) return 0;
    const [sH, sM] = sleepTime.split(':').map(Number);
    const [wH, wM] = wakeTime.split(':').map(Number);
    let sleepDate = new Date(2020, 0, 1, sH, sM);
    let wakeDate = new Date(2020, 0, 2, wH, wM);
    return (wakeDate - sleepDate) / (1000 * 60 * 60);
}

function openAddModal(userKey) {
    activeTargetUser = userKey;
    document.getElementById('custom-task-modal').style.display = 'flex';
    document.getElementById('modal-submit-btn').onclick = saveCustomTask;
}

function closeAddModal() {
    document.getElementById('custom-task-modal').style.display = 'none';
    document.getElementById('custom-task-name').value = '';
}

async function saveCustomTask() {
    const textStr = document.getElementById('custom-task-name').value.trim();
    if (!textStr) return;

    localCacheData[activeTargetUser].tasks.push({
        id: 'custom_' + Date.now(),
        text: textStr,
        type: 'check',
        val: false
    });

    const updatePayload = {};
    updatePayload[`${activeTargetUser}_tasks`] = localCacheData[activeTargetUser].tasks;

    await supabase
        .from('daily_records')
        .update(updatePayload)
        .eq('date_string', currentDateString);

    loadDayData();
    closeAddModal();
}

// --- 6. DATA FINALIZE SUBMIT ---
async function manualSave(userKey) {
    const updatePayload = {};
    updatePayload[`${userKey}_saved`] = true;

    await supabase
        .from('daily_records')
        .update(updatePayload)
        .eq('date_string', currentDateString);
    
    alert(`Data saved to the cloud!`);
    loadDayData();
}

// --- 7. AUTO MIDNIGHT LOCKOUT SYNC ---
function startMidnightTimer() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    setTimeout(() => {
        autoSaveAll();
        setInterval(autoSaveAll, 24 * 60 * 60 * 1000);
    }, midnight - now);
}

async function autoSaveAll() {
    await supabase
        .from('daily_records')
        .update({ user1_saved: true, user2_saved: true })
        .eq('date_string', currentDateString);
    loadDayData();
}

// --- 8. WINNER DETERMINATION ENGINE ---
function evaluateWinner(dayData) {
    const banner = document.getElementById('daily-winner-banner');
    
    if (!dayData.user1.saved || !dayData.user2.saved) {
        banner.className = "winner-banner";
        banner.textContent = "Waiting for both users to click Save to reveal the daily winner!";
        return;
    }

    let u1Score = calculateScore(dayData.user1.tasks);
    let u2Score = calculateScore(dayData.user2.tasks);

    if (u1Score > u2Score) {
        banner.className = "winner-banner highlight-yellow";
        banner.textContent = `👑 A PANI PEVIN Wins! (Score: ${u1Score} vs ${u2Score})`;
    } else if (u2Score > u1Score) {
        banner.className = "winner-banner highlight-yellow";
        banner.textContent = `👑 SHIT DHANUSHYA Wins! (Score: ${u2Score} vs ${u1Score})`;
    } else {
        banner.className = "winner-banner";
        banner.textContent = `🤝 It's a Tie Game! (Score: ${u1Score} vs ${u2Score})`;
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
            if (hrs >= 7) score++; 
        }
    });
    return score;
}
