// Application state
let spreadsheetId = null;
let tasks = [];
let timerIntervals = {};

async function initializeSpreadsheet() {
    try {
        await ensureValidToken();
        updateSyncStatus('Initializing spreadsheet...');

        // Search for existing spreadsheet
        const searchResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=name='Time Tracker Data' and mimeType='application/vnd.google-apps.spreadsheet'`,
            { headers: { Authorization: `Bearer ${getAccessToken()}` } }
        );
        const searchData = await searchResponse.json();

        if (searchData.files && searchData.files.length > 0) {
            spreadsheetId = searchData.files[0].id;
            updateSyncStatus('Connected to existing spreadsheet ✓');
        } else {
            // Create new spreadsheet
            const createResponse = await fetch(
                'https://sheets.googleapis.com/v4/spreadsheets',
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${getAccessToken()}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        properties: { title: 'Time Tracker Data' },
                        sheets: [{
                            properties: { title: 'Tasks' }
                        }]
                    })
                }
            );
            const createData = await createResponse.json();
            spreadsheetId = createData.spreadsheetId;

            // Add headers
            await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Tasks!A1:C1?valueInputOption=RAW`,
                {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${getAccessToken()}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        values: [['Task ID', 'Task Name', 'Total Time (seconds)']]
                    })
                }
            );

            updateSyncStatus('Created new spreadsheet ✓');
        }
    } catch (error) {
        console.error('Error initializing spreadsheet:', error);
        updateSyncStatus('Error: Could not initialize spreadsheet');
    }
}

async function loadTasksFromSheet() {
    try {
        await ensureValidToken();
        updateSyncStatus('Loading tasks...');
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Tasks!A2:C`,
            { headers: { Authorization: `Bearer ${getAccessToken()}` } }
        );
        const data = await response.json();

        if (data.values) {
            tasks = data.values.map(row => ({
                id: parseInt(row[0]),
                name: row[1],
                elapsed: parseInt(row[2]) * 1000,
                isRunning: false,
                startTime: null
            }));
        }

        renderTasks();
        updateSyncStatus('Tasks loaded ✓');
    } catch (error) {
        console.error('Error loading tasks:', error);
        updateSyncStatus('Error loading tasks');
    }
}

async function saveTasksToSheet(tryCount = 0) {
    if (!spreadsheetId || !getAccessToken()) return;
    try {
        await ensureValidToken();
        
        if (tryCount > 3) {
            throw new Error('Sync failed after 3 attempts');
        }

        const values = tasks
            .filter(task =>  task.isRunning)
            .map(task => [
            task.id,
            task.name,
            Math.floor(task.elapsed / 1000)
        ]);

        updateSyncStatus('Start syncing');
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Tasks!A2:C?valueInputOption=RAW`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${getAccessToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ values })
            }
        );

        // Handle 401 Unauthorized - token might be invalid
        if (response.status === 401) {
            await refreshAccessToken();
            // Retry the request
            await saveTasksToSheet(tryCount + 1);
            return;
        }

        updateSyncStatus('Synced ✓');
    } catch (error) {
        console.error('Error saving tasks:', error);
        updateSyncStatus('Sync error');
    }
}

function updateSyncStatus(message) {
    document.getElementById('syncStatus').textContent = message;
}

function addTask() {
    const input = document.getElementById('taskInput');
    const taskName = input.value.trim();

    if (taskName === '') {
        alert('Please enter a task name');
        return;
    }

    const task = {
        id: Date.now(),
        name: taskName,
        elapsed: 0,
        isRunning: false,
        startTime: null
    };

    tasks.push(task);
    input.value = '';
    renderTasks();
    saveTasksToSheet();
}

function startTimer(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    task.isRunning = true;
    task.startTime = Date.now();

    timerIntervals[taskId] = setInterval(() => {
        const now = Date.now();
        const elapsed = task.elapsed + (now - task.startTime);
        updateTaskDisplay(taskId, elapsed);
    }, 100);

    renderTasks();
}

function stopTimer(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    task.isRunning = false;
    const now = Date.now();
    task.elapsed += (now - task.startTime);
    task.startTime = null;

    clearInterval(timerIntervals[taskId]);
    delete timerIntervals[taskId];

    renderTasks();
    saveTasksToSheet();
}

function deleteTask(taskId) {
    if (timerIntervals[taskId]) {
        clearInterval(timerIntervals[taskId]);
        delete timerIntervals[taskId];
    }

    tasks = tasks.filter(t => t.id !== taskId);
    renderTasks();
    saveTasksToSheet();
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateTaskDisplay(taskId, elapsed) {
    const timeElement = document.getElementById(`time-${taskId}`);
    if (timeElement) {
        timeElement.textContent = formatTime(elapsed);
    }
}

function renderTasks() {
    const taskList = document.getElementById('taskList');

    if (tasks.length === 0) {
        taskList.innerHTML = `
            <div class="empty-state">
                <p>No tasks yet. Add one to get started!</p>
            </div>
        `;
        return;
    }

    taskList.innerHTML = tasks.map(task => `
        <li class="task-item ${task.isRunning ? 'running' : ''}">
            <div class="task-info">
                <div class="task-name">${task.name}</div>
                <div class="task-time" id="time-${task.id}">${formatTime(task.elapsed)}</div>
            </div>
            <div class="task-actions">
                ${task.isRunning
                    ? `<button class="btn btn-stop" onclick="stopTimer(${task.id})">Stop</button>`
                    : `<button class="btn btn-start" onclick="startTimer(${task.id})">Start</button>`
                }
                <button class="btn btn-delete" onclick="deleteTask(${task.id})">Delete</button>
            </div>
        </li>
    `).join('');
}

document.getElementById('taskInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addTask();
    }
});

// Initialize on load
window.onload = async () => {
    initializeGoogleAuth();
    renderTasks();

    // Try to restore session from localStorage
    await restoreSession();

    setInterval(saveTasksToSheet, 10000);
};