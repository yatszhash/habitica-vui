'use strict';

const rp = require('request-promise-native');

export class Habitica {
    static API_ROOT = "https://habitica.com/api/v3";
    id: string;
    token: string;
    common_auth_header: object;

    constructor(id, token) {
        this.id = id;
        this.token = token;
        this.common_auth_header = {
            "x-api-user": id,
            "x-api-key": token
        };
    }

    createUserTask(task: Task): Promise<any> {
        const header = JSON.parse(JSON.stringify(this.common_auth_header));
        const options = {
            method: "POST",
            uri: `${Habitica.API_ROOT}/tasks/user`,
            headers: header,
            json: true,
            body: task
        };

        return rp(options);
    }

    //TODO refactor
    findTask(taskName: String): Promise<any> {
        return this.listTask()
            .then(
                (repos) => {
                    const taskList = repos.data;
                    const registeredTaskTexts = taskList.map(t => t.text);

                }
            );
    }

    listTask(): Promise<any> {
        const options = {
            method: "GET",
            uri: `${Habitica.API_ROOT}/tasks/user`,
            headers: this.common_auth_header,
            json: true
        };

        return rp(options);
    }
}

export enum PRIORITY {
    hard = "2",
    medium = "1.5",
    easy = "1",
    trivial = "0.1"
}

export enum TASK_TYPE {
    habit = "habit",
    daily = "daily",
    todo = "todo",
    reward = "reward"
}

export class Task {
    text: string;
    type: TASK_TYPE;
    priority: PRIORITY;

    constructor(text: string, tasktype: TASK_TYPE, priority = PRIORITY.medium) {
        this.text = text;
        this.type = tasktype;
        this.priority = priority;
    }
}
