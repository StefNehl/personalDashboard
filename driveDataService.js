/**
 * @typedef {Object} TaskData
 * @property {number} id
 * @property {string} name
 * @property {number} elapsed - Total accumulated time
 * @property {boolean} isRunning
 * @property {number | null} currentStartTime
 * @property {Date | null} startDateTime
 * @property {boolean} isFinished
 * @property {Date | null} finishedDateTime
 * @property {boolean} isDeleted
 */

/**
 * Runtime schema for TaskData
 * @type {Object.<string, string>}
 */
const TaskDataSchema = {
    id: 'number',
    name: 'string',
    elapsed: 'number',
    isRunning: 'boolean',
    currentStartTime: 'number | null',
    startDateTime: 'Date | null',
    isFinished: 'boolean',
    finishedDateTime: 'Date | null',
    isDeleted: 'boolean'
};

/**
 * @typedef {Object} InitResponse
 * @property {boolean} createdDataSheet
 * @property {boolean} syncedHeaders
 * @property {boolean} failedToInit
 * @property {Response | null} failedResponse
 */

class DriveDataService {
    /**
     * @param {string} fileName
     * @param {string} accessToken
     * @param {Object<string, string>} dataSchema
     */
    constructor(fileName, accessToken, dataSchema) {
        /** @type {string | null} */
        this.accessToken = null;
        /** @type {string | null} */
        this.spreadsheetId = null;
        /** @type {string} */
        this.fileName = fileName;
        /** @type {string} */
        this.accessToken = accessToken;
        /** @type {Object<string, string>} */
        this.dataSchema = dataSchema;
    }

    
    /**
     * Initialize the data service
     * @returns {Promise<InitResponse>} Returns true if a data sheet was created, false if it already exists
     */
    async initDataService() {
        this.spreadsheetId = await this.getSpreadSheetId();
        
        let initSpreadSheet = false;
        let initHeaders = false;
        
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
                        properties: {title: this.fileName},
                        sheets: [{
                            properties: {title: 'Tasks'}
                        }]
                    })
                }
            );
            const createData = await createResponse.json();
            this.spreadsheetId = createData.spreadsheetId;
            initSpreadSheet = true;
        }
        const headersResponse = await this.getHeaders();
        if (!headersResponse.ok) {
            return {
                createdDataSheet: initSpreadSheet,
                syncedHeaders: initHeaders,
                failedToInit: true,
                failedResponse: headersResponse
            };
        }
        const headers = await headersResponse.json();
        if (!headers.values || headers.values.length === 0) {}
        const headersCorrect = this.validateHeaderExact(headers);
        if (headersCorrect === false) {
            const schemaKeys = Object.keys(this.dataSchema);
            await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/Tasks!A1:1?valueInputOption=RAW`,
                {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${this.accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        values: [schemaKeys]
                    })
                }
            );
            initHeaders = true;
        }
        return {
            createdDataSheet: initSpreadSheet,
            syncedHeaders: initHeaders,
            failedToInit: false,
            failedResponse: null
        };
    }

    /**
     * @param {string[]} headers
     * @returns {boolean}
     */
    validateHeaderExact(headers) {
        const schemaKeys = Object.keys(TaskDataSchema);
        return headers.length === schemaKeys.length &&
            headers.every((header, i) => header === schemaKeys[i]);
    }
    
    /**
     * @returns {Promise<Response>}
     */
    async getHeaders() {
        return fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/Tasks!A1:1`,
            {
                method: 'GET',
                headers: { Authorization: `Bearer ${this.accessToken}`,},
            }
        );
    }


    /**
     * @returns {Promise<string | null>}
     */
    async getSpreadSheetId() {
        const searchResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=name='${this.fileName}' and mimeType='application/vnd.google-apps.spreadsheet'`,
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
        const schemaKeys = Object.keys(this.dataSchema);
        const lastColumn = String.fromCharCode(65 + schemaKeys.length - 1); // A + length - 1

        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/Tasks!A2:${lastColumn}`,
            { headers: { Authorization: `Bearer ${this.accessToken}` } }
        );
        const data = await response.json();
        if (data.values) {
            tasks.push(...data.values
                .map(row => {
                    if (!row) return null;
                    return this.convertRowValuesToTask(row);})
                .filter(task => task !== null)
            );
        }
        return tasks;
    }

    /**
     * @param {string[]} row 
     * @returns {TaskData}
     */
    convertRowValuesToTask(row) {
        const task = {};
        const schemaKeys = Object.keys(TaskDataSchema);
        schemaKeys.forEach((key, index) => {
            let value = row[index];
            // Convert values from storage
            if (key === 'id') {
                task[key] = parseInt(value);
            } else if (key === 'elapsed') {
                task[key] = parseInt(value);
            } else if (key === 'isRunning' || key === 'isFinished' || key === 'isDeleted') {
                task[key] = value === 'TRUE' || value === true;
            } else if (key === 'currentStartTime') {
                task[key] = value ? parseInt(value) : null;
            } else if (key === 'startDateTime' || key === 'finishedDateTime') {
                task[key] = value ? new Date(value) : null;
            } else {
                task[key] = value || null;
            }
        });
        return task;
    }

    /**
     * @param {TaskData[]} tasks
     * @returns {Promise<Response | null>}
     */
    async syncTasks(tasks) {
        if (!tasks || tasks.length === 0) return null;
        const schemaKeys = Object.keys(TaskDataSchema);
        const lastColumn = String.fromCharCode(65 + schemaKeys.length - 1); // A + length - 1

        // Upload client data
        const values = tasks
            .map(task => schemaKeys.map(key => {
                // Convert values for storage
                if (key === 'elapsed') {
                    return task[key];
                }
                return task[key];
            }));

        return await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/Tasks!A2:${lastColumn}?valueInputOption=RAW`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ values })
            }
        );
    }
}
