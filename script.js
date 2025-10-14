// Application state
let tasks = undefined;
let timerIntervals = {};
/** type {DriveDataService} */
let dataService = null;
let lastSync = null;
const syncIntervalInSeconds = 1;
/** @type {number | null} */
let syncTaskId = null;

async function initDataService() {
    await ensureValidToken();
    dataService = new DriveDataService('Time Tracker Data', accessToken, TaskDataSchema);
    const result = await dataService.initDataService();
    if (result.failedToInit) {
        throw new Error('Failed to initialize data service');
    }
    updateSyncStatus(result);
}

async function handleSignIn() {
    await signIn();
}

function handleSignOut() {
    signOut();
    stopTaskSync();

    document.getElementById('signedOut').style.display = 'block';
    document.getElementById('signedIn').style.display = 'none';
    document.getElementById('appContent').classList.add('disabled');
    document.getElementById('userEmail').textContent = '';
    renderTasks();
}

async function ensureSyncTaskStarted() {
    if (syncTaskId) return;
    await saveTasksToSheet();
    syncTaskId = setInterval(saveTasksToSheet, 10000);
}

function stopTaskSync() {
    if (!syncTaskId) return;
    clearInterval(syncTaskId);
    syncTaskId = null;
}

async function loadTasksFromSheet() {
    await ensureValidToken();
    updateSyncStatus('Loading tasks...');
    tasks = await dataService.loadTasks();
    renderTasks();
    updateSyncStatus('Tasks loaded ✓');
}

async function saveTasksToSheet() {
    if (!lastSync) {
        const diffTime = new Date() - lastSync;
        if (diffTime < syncIntervalInSeconds * 1000) return;
    }
    try {
        await ensureValidToken();
        updateSyncStatus('Start syncing');
        if (!tasks) {
            updateSyncStatus('Tasks not loaded.');
            return;
        }
        for (let tryCount = 0; tryCount < 3; tryCount++) {
            const response = await dataService.syncTasks(tasks);
            if (!response) {
                updateSyncStatus('Sync failed.');
            }
            if (response.status === 401) {
                await refreshAccessToken();
            }
            if (response.status === 200) {
                updateSyncStatus('Synced ✓');
                lastSync = new Date();
                return;
            }
        }
        updateSyncStatus('Sync failed after 3 tries!');
    } catch (error) {
        console.error('Error saving tasks:', error);
        updateSyncStatus('Sync error');
    }
}

function updateSyncStatus(message) {
    document.getElementById('syncStatus').textContent = message;
}

async function addTask() {
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
        currentStartTime: null,
        startDateTime: null,
        isFinished: false,
        finishedDateTime: null,
        isDeleted: false
    };

    tasks.push(task);
    input.value = '';
    renderTasks();
    await saveTasksToSheet();
}

function startTimer(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    task.isRunning = true;
    task.currentStartTime = Date.now();
    if (!task.startDateTime) {
        task.startDateTime = new Date();
    }

    timerIntervals[taskId] = setInterval(() => {
        const currentlyElapsedTimeInSeconds = Math.floor(Date.now() - task.currentStartTime) / 1000;
        const elapsed = task.elapsed + currentlyElapsedTimeInSeconds;
        updateTaskDisplay(taskId, elapsed);
    }, 100);

    renderTasks();
}

async function stopTimer(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    if (task.isRunning === false) return;

    task.isRunning = false;
    const now = Date.now();
    task.elapsed += Math.floor((now - task.currentStartTime) / 1000);
    task.currentStartTime = null;

    clearInterval(timerIntervals[taskId]);
    delete timerIntervals[taskId];

    renderTasks();
    await saveTasksToSheet();
}

async function deleteTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    if (timerIntervals[taskId]) {
        clearInterval(timerIntervals[taskId]);
        delete timerIntervals[taskId];
    }

    task.isDeleted = true;
    renderTasks();
    await saveTasksToSheet();
}

async function finishTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    await stopTimer(taskId);
    task.isFinished = true;
    task.finishedDateTime = new Date();
    renderTasks();
    await saveTasksToSheet();
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
        timeElement.textContent = formatTime(elapsed * 1000);
    }
}

function renderTasks() {
    const activeTaskList = document.getElementById('activeTaskList');
    const finishedTaskList = document.getElementById('finishedTaskList');

    const activeTasks = tasks?.filter(task => !task.isFinished && !task.isDeleted) ?? [];
    const finishedTasks = tasks?.filter(task => task.isFinished && !task.isDeleted) ?? [];

    // Render active tasks
    if (activeTasks.length === 0) {
        activeTaskList.innerHTML = `
            <div class="empty-state">
                <p>No active tasks yet. Add one to get started!</p>
            </div>
        `;
    } else {
        activeTaskList.innerHTML = activeTasks.map(task => `
            <li class="task-item ${task.isRunning ? 'running' : ''}">
                <div class="task-info">
                    <div class="task-name">${task.name}</div>
                    <div class="task-time" id="time-${task.id}">${formatTime(task.elapsed * 1000)}</div>
                </div>
                <div class="task-actions">
                    ${task.isRunning
                        ? `<button class="btn btn-stop" onclick="stopTimer(${task.id})">Stop</button>`
                        : `<button class="btn btn-start" onclick="startTimer(${task.id})">Start</button>`
                    }
                    <button class="btn btn-delete" onclick="deleteTask(${task.id})">Delete</button>
                    <button class="btn btn-finish" onclick="finishTask(${task.id})">Finish</button>
                </div>
            </li>
        `).join('');
    }

    // Render finished tasks
    if (finishedTasks.length === 0) {
        finishedTaskList.innerHTML = `
            <div class="empty-state">
                <p>No finished tasks yet.</p>
            </div>
        `;
    } else {
        finishedTaskList.innerHTML = finishedTasks.map(task => `
            <li class="task-item">
                <div class="task-info">
                    <div class="task-name">${task.name}</div>
                    <div class="task-time">${formatTime(task.elapsed * 1000)}</div>
                </div>
                <div class="task-actions">
                    <button class="btn btn-delete" onclick="deleteTask(${task.id})">Delete</button>
                </div>
            </li>
        `).join('');
    }
}

document.getElementById('taskInput').addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        await addTask();
    }
});

// Initialize on load
window.onload = async () => {
    initializeGoogleAuth();
    const sessionRestored = await restoreSession();
    if (sessionRestored) await ensureSyncTaskStarted();
    renderTasks();
};