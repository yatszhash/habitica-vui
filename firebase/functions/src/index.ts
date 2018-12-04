// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';

const functions = require('firebase-functions');
import {WebhookClient} from 'dialogflow-fulfillment';

const {Card, Suggestion} = require('dialogflow-fulfillment');
const rp = require('request-promise-native');
const {Utils} = require('./utils');
const {Habitica, PRIORITY, TASK_TYPE, Task} = require('./habitica');
process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

const APP_NAME = "HABITICA-VUI";
const HABITICA_ID = process.env.HABITICA_ID;
const HABITICA_TOKEN = process.env.HABITICA_TOKEN;

const HABITICA = {
    rootUri: "https://habitica.com/api/v3"
};

const TASK_MAP = new Map([
    ["習慣", TASK_TYPE.habit],
    ["TODO", TASK_TYPE.todo],
    ["日課", TASK_TYPE.daily]
]);

const PRIORITY_MAP = new Map([
    ["難しい", PRIORITY.hard],
    ["普通", PRIORITY.medium],
    ["簡単", PRIORITY.easy],
    ["ちょちょい", PRIORITY.trivial]
]);
const CREATE_TASK_FOLLOWUP = "createtask-followup";

const TIPS = [
    '悪い習慣をやめたいときには、良い習慣で置き換えるのがコツです。',
    'もし生活をガラッと変えたいなら、良い習慣を一つだけ設定して、それを達成することに一か月集中してみてください。きっとそれにつられて他の習慣も変わっていくはずです。',  // key stone habit,
    '気が進まないタスクがあるときは、最初の10秒でできることを設定してみてください。とりあえず始めてみると、意外と進められるかもしれません'  // 10秒アクション
];


exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request, response) => {
    const habitica = new Habitica(HABITICA_ID, HABITICA_TOKEN);
    const agent = new WebhookClient({request, response});
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    function searchContext(contextType: String, array: Array<any>): any {
        const pattern = new RegExp(".*" + contextType + ".*", "i");
        //TODO replace with stored session
        return array.find(function (element) {
            return element.name.match(pattern);
        });
    }

    function clearAllContext(agent) {
        agent.contexts.forEach(
            context => {
                agent.clearContext(context);
                context["lifespan"] = "0";
                agent.setContext(context);
            }
        );
    }

    function welcome(agent) {
        agent.add(`ようこそ${APP_NAME}へ`);
        //TIPS
        agent.add(Utils.randomChoice(TIPS));
        return Promise.resolve();
    }

    function fallback(agent) {
        const context = searchContext(CREATE_TASK_FOLLOWUP, agent.contexts);
        if (context) {
            return askPriority(agent);
        }
        agent.add(`よく理解できませんでした。`);
        agent.add(`申し訳ありませんが、もう一度表現を変えてお試しください`);

        clearAllContext(agent);
        //agent.clearOutgoingContexts();
        return Promise.resolve();
    }

    function listTasks(agent) {
        //TODO return first one based on priority and due
        agent.add("現在登録されているタスクの中で一番最初のものは");

        const options = {
            uri: "https://habitica.com/api/v3/tasks/user",
            headers: {
                "x-api-user": HABITICA_ID,
                "x-api-key": HABITICA_TOKEN
            },
            json: true
        };

        return rp(options).then(
            repos => {
                console.log(repos.data);
                agent.add(repos.data[0].text);
            })
            .catch(
                err => {
                    console.log(err);
                    agent.add(err);
                }
            );
    }

    function createTask(agent) {
        const taskType = agent.parameters["taskType"];
        agent.add(`どのようなタスクを${taskType}に登録しますか？`);
        agent.setContext(
            {
                name: CREATE_TASK_FOLLOWUP,
                lifespan: "5",
                parameters: {
                    task: {
                        taskType: taskType
                    }
                }
            }
        );
        return Promise.resolve();
    }

    function askPriority(agent) {
        //TODO suggest difficulty from history
        const context = searchContext(CREATE_TASK_FOLLOWUP, agent.contexts);
        if (!context) {
            return fallback(agent);
        }

        const newContext = JSON.parse(JSON.stringify(context));

        agent.clearContext(context);
        newContext.parameters.task.text = agent.query;
        agent.setContext(newContext);

        agent.add("難易度は何にしますか");

        const priorities = Array.from(PRIORITY_MAP.keys());
        const suggestion = new Suggestion(priorities.pop());
        priorities.forEach(function (priority) {
            suggestion.addReply_(priority);
        });
        agent.add(suggestion);
        return Promise.resolve();
    }

    function confirmTaskRegistration(agent) {
        const context = searchContext(CREATE_TASK_FOLLOWUP, agent.contexts);
        if (!context) {
            return fallback(agent);
        }

        //TODO validation
        const priority = agent.parameters["priority"];
        const {taskType, text} = context.parameters.task;

        const newContext = JSON.parse(JSON.stringify(context));
        agent.clearContext(context);
        newContext.parameters.task.priority = priority;
        agent.setContext(newContext);
        agent.add(`タスク、${text}、を${taskType}に難易度${priority}で登録します。よろしいですか？`);

        const suggestion = new Suggestion("はい");
        suggestion.addReply_("いいえ");
        agent.add(suggestion);

        return Promise.resolve();
    }

    function registerTask(agent) {
        const {text, taskType, priority} = searchContext(CREATE_TASK_FOLLOWUP, agent.contexts).parameters.task;

        const task = new Task(text, TASK_MAP.get(taskType), PRIORITY_MAP.get(priority));

        clearAllContext(agent);
        //agent.clearOutgoingContexts();

        return habitica.createUserTask(task)
            .then((response) => agent.add('タスクを登録しました'))
            .catch((err) => {
                console.log(err);
                agent.clearOutgoingContexts();
                agent.add('タスクの登録中にエラーが起こりました。')
            });
    }

    function scoreTask(agent) {
        agent.add("どのタスクをチェックしますか？");

        agent.setContext(
            {
                name: "scoretask-followup",
                lifespan: 5,
                parameters: {}
            }
        );
        return Promise.resolve();
    }

    function findTask(agent) {
        return Promise.resolve();
    }

    function cancel(agent) {
        agent.add("キャンセルしました");

        clearAllContext(agent);

        return Promise.resolve();
    }

    // // Uncomment and edit to make your own intent handler
    // // uncomment `intentMap.set('your intent name here', yourFunctionHandler);`
    // // below to get this function to be run when a Dialogflow intent is matched
    // function yourFunctionHandler(agent) {
    //   agent.add(`This message is from Dialogflow's Cloud Functions for Firebase editor!`);
    //   agent.add(new Card({
    //       title: `Title: this is a card title`,
    //       imageUrl: 'https://developers.google.com/actions/images/badges/XPM_BADGING_GoogleAssistant_VER.png',
    //       text: `This is the body text of a card.  You can even use line\n  breaks and emoji! 💁`,
    //       buttonText: 'This is a button',
    //       buttonUrl: 'https://assistant.google.com/'
    //     })
    //   );
    //   agent.add(new Suggestion(`Quick Reply`));
    //   agent.add(new Suggestion(`Suggestion`));
    //   agent.setContext({ name: 'weather', lifespan: 2, parameters: { city: 'Rome' }});
    // }

    // // Uncomment and edit to make your own Google Assistant intent handler
    // // uncomment `intentMap.set('your intent name here', googleAssistantHandler);`
    // // below to get this function to be run when a Dialogflow intent is matched
    // function googleAssistantHandler(agent) {
    //   let conv = agent.conv(); // Get Actions on Google library conv instance
    //   conv.ask('Hello from the Actions on Google client library!') // Use Actions on Google library
    //   agent.add(conv); // Add Actions on Google library responses to your agent's response
    // }
    // // See https://github.com/dialogflow/dialogflow-fulfillment-nodejs/tree/master/samples/actions-on-google
    // // for a complete Dialogflow fulfillment library Actions on Google client library v2 integration sample

    // Run the proper function handler based on the matched Dialogflow intent name
    const intentMap = new Map<string, (agent) => Promise<any>>();
    intentMap.set('Default Welcome Intent', welcome);
    intentMap.set('Default Fallback Intent', fallback);
    intentMap.set('listTasks', listTasks);

    intentMap.set('scoreTask', scoreTask);
//  intentMap.set('scoreTask-askTask', askTask);
    intentMap.set('scoreTask-findTask', findTask);
//  intentMap.set('scoreTask-complete', completeScoreTask);

    intentMap.set('createTask', createTask);
    intentMap.set('createTask-askPriority', askPriority);
    intentMap.set('createTask-confirmTaskRegistration', confirmTaskRegistration);
    intentMap.set('createTask-registerTask', registerTask);
    intentMap.set('cancel', cancel);
    // intentMap.set('your intent name here', yourFunctionHandler);
    // intentMap.set('your intent name here', googleAssistantHandler);
    agent.handleRequest(intentMap);
});
