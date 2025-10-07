/**
 * @typedef {Object} TaskData
 * @property {number} id
 * @property {string} name
 * @property {number} elapsed
 * @property {boolean} isRunning
 * @property {number | null} startTime
 * @property {Date | null} startDateTime
 */

/**
 * @returns {DriveDataService}
 */
function getInstance() {
    return new DriveDataService();
}

class DriveDataService {
    constructor() {
        /** @type {string | null} */
        this.accessToken = null;
        /** @type {string | null} */
        this.spreadsheetId = null;
    }

    /**
     * Initialize the data service
     * @param {string} accessToken
     * @returns {Promise<boolean>} Returns true if a data sheet was created, false if it already exists
     */
    async initDataService(accessToken) {
        this.accessToken = accessToken;

        this.spreadsheetId = await this.getSpreadSheetId();
        if (!this.spreadsheetId) {
            const createResponse = await fetch(
                'https://sheets.googleapis.com/v4/spreadsheets',
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
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
            this.spreadsheetId = createData.spreadsheetId;

            // Add headers
            await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/Tasks!A1:C1?valueInputOption=RAW`,
                {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        values: [['Task ID', 'Task Name', 'Total Time (seconds)']]
                    })
                }
            );
            return true;
        }
        return false;
    }


    /**
     * @returns {Promise<string | null>}
     */
    async getSpreadSheetId() {
        const searchResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=name='Time Tracker Data' and mimeType='application/vnd.google-apps.spreadsheet'`,
            { headers: { Authorization: `Bearer ${getAccessToken()}` } }
        );
        const searchData = await searchResponse.json();
        if (searchData.files && searchData.files.length > 0) {
            return searchData.files[0].id;
        }
        return null;
    }

    /**
     * @returns {Promise<TaskData[]>}
     */
    async loadTasks() {
        const tasks = [];
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/Tasks!A2:C`,
            { headers: { Authorization: `Bearer ${this.accessToken}` } }
        );
        const data = await response.json();
        if (data.values) {
            tasks.push(...data.values.map(row => ({
                id: parseInt(row[0]),
                name: row[1],
                elapsed: parseInt(row[2]) * 1000,
                isRunning: false,
                startTime: null,
                startDateTime: null
            })));
        }
        return tasks;
    }

    /**
     * @param {TaskData[]} tasks
     * @returns {Promise<Response>}
     */
    async syncTasks(tasks) {
        const values = tasks
            .filter(task => !task.isRunning)
            .map(task => [
                task.id,
                task.name,
                Math.floor(task.elapsed / 1000)
            ]);

        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/Tasks!A2:C?valueInputOption=RAW`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ values })
            }
        );
        return response;
    }
}
