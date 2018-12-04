'use strict';


export class Utils {
    static randomChoice = function <T>(array: Array<T>): T {
        return Array[Math.floor(Math.random() * array.length)];
    };
}
