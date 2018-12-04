'use strict';

import {promisify} from "util";
import *  as mathjs from 'mathjs';
import {BigNumber, Complex, MathArray, Matrix} from 'mathjs';
import {builder, Tokenizer} from "kuromoji";
//import {murmurHash} from "murmurhash-native";
import {AssertionError} from "assert";

export class Searcher {
    protected tokenizer: Tokenizer<any>;
    static KUROMOJI_DICT_DIR = "node_modules/kuromoji/dict/";
    // method = "tfidf";
    tokenDict: TokenDict;
    bagOfWordsIndex: Matrix;
    docIds: Array<any>;

    constructor() {
        this.tokenDict = new TokenDict();
        //this.bagOfWordsIndex = mathjs.matrix([0]);
        this.docIds = [];
        this.prepareTokenizer().then();
    };


    add(stringMap: Map<any, string>): Promise<void> {
        return this.prepareTokenizer()
            .then(() => Promise.resolve(this.tokenizeDocs(stringMap)))
            .then((tokenMap) => {
                this.addTokens(tokenMap);
                this.createBagOfWordsIndex(tokenMap);
                return Promise.resolve();
            });
    }

    prepareTokenizer(): Promise<void> {
        if (!this.tokenizer) {
            //FIXME Does promisefy work on firebase searver?
            const tokenizerBuilder = builder({dicPath: Searcher.KUROMOJI_DICT_DIR});
            // promisify require binding context
            (tokenizerBuilder as any).promiseBuild = promisify(tokenizerBuilder.build);
            return (tokenizerBuilder as any).promiseBuild()
                .then((tokenizer) => {
                        this.tokenizer = tokenizer;
                        return Promise.resolve();
                    }
                );
        } else {
            return Promise.resolve();
        }
    }

    tokenizeDocs(stringMap: Map<any, string>): Promise<Map<any, Array<string>>> {
        const entryToTokens = (entry) => {
            return new Promise<[any, string[]]>(
                (fulfilled, rejected) => {
                    const tokenObjs: any = this.tokenizer.tokenize(entry[1]);
                    fulfilled([entry[0], tokenObjs.map(tokenObj => tokenObj.surface_form)]);
                })
        };

        return this.prepareTokenizer()
            .then(() => Promise.all(Array.from(stringMap.entries())
                .map(entry => entryToTokens(entry))))
            .then((entries) => Promise.resolve(new Map(entries)));
    }

    tokenizeText(text: string) {
        return this.prepareTokenizer()
            .then(
                () => {
                    const tokenObjs: any = this.tokenizer.tokenize(text);
                    return Promise.resolve(
                        tokenObjs.map(tokenObj => tokenObj.surface_form)
                    );
                }
            );
    }

    createBagOfWordsIndex(tokensMap: Map<any, Array<string>>) {
        this.docIds = Array.from(tokensMap).map(entry => entry[0]);
        const dictSize = this.tokenDict.indexToTokenMap.size;
        const bagOfWordsIndex = mathjs.zeros([tokensMap.size, dictSize],
            "sparse");
        if (bagOfWordsIndex instanceof Array) {
            throw new AssertionError()
        }
        this.bagOfWordsIndex = bagOfWordsIndex;
        let i = 0;

        // this.bagOfWordsIndex = mathjs.concat.apply(null, Array.from(tokensMap.entries())
        //                         .map(entry => this.tokenDict.tokensToBagOfWordsVector(entry[1])))

        for (let entry of tokensMap.entries()) {
            const vector = this.tokenDict.tokensToBagOfWordsVector(entry[1]);
            this.bagOfWordsIndex.subset(mathjs.index(i, mathjs.range(0, dictSize)), vector);
            i++;
        }
    }

    addTokens(stringMap: Map<any, Array<string>>) {
        const allTokens = new Set(
            Array.from(stringMap.entries(), entry => entry[1])
                .reduce(function (a, b) {
                    return a.concat(b);
                }, []));
        this.tokenDict.addAll(allTokens);
    }

    searchByCosineSimilarity(queryText: string, numCandidates: number): Promise<Array<any>> {
        if (!this.bagOfWordsIndex) {
            throw new Error("you should create index before search");
        }
        const queryVector: Promise<Matrix> = this.tokenizeText(queryText).then(
            (tokens) => this.tokenDict.tokensToBagOfWordsVector(tokens)
        );

        const compareVectos = (queryVector: Matrix) => {
            if (normSparse(queryVector) <= 0) {
                return []
            }

            const indexNRows = this.bagOfWordsIndex.size()[0];
            const indexNCols = this.bagOfWordsIndex.size()[1];
            const similarities = mathjs.range(0, indexNRows)
                .map(i =>
                    Searcher.computeCosineSimilarity(queryVector, this.bagOfWordsIndex.subset(
                        mathjs.index(i, mathjs.range(0, indexNCols)))));
            const similaritiesArray = <Array<number>>similarities.valueOf();

            const candidatesIndex = Array.from(similaritiesArray.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, numCandidates);

            return Promise.resolve(candidatesIndex.map(entry => {
                return {
                    score: entry[1],
                    docId: this.docIds[entry[0]]
                }
            }));
        };
        return queryVector.then(compareVectos);
    }

    static computeCosineSimilarity(vector1, vector2) {
        let norm1 = normSparse(vector1);
        let norm2 = normSparse(vector2);

        if (norm1 <= 0 || norm2 <= 0) {
            return 0;
        }
        const products = mathjs.multiply(vector1, mathjs.transpose(vector2));
        const result = mathjs.divide(products,
            mathjs.multiply(norm1, norm2));

        if (isMatrix(result)) {
            return result.get([0, 0]);
        }
        return result;
    }
}

export class TokenDict {
    //TODO should I replce with trie or hash table?
    tokenToIndexMap: Map<string, number>;
    indexToTokenMap: Map<number, string>;
    static UNKNOWN_TOKEN_INDEX = 0;
    static UNKNOWN_TOKEN_ALIAS = 'unknown' + '12336521';

    constructor(tokenSet?: Set<string>) {
        this.tokenToIndexMap = new Map<string, number>();
        this.indexToTokenMap = new Map<number, string>();
        this.tokenToIndexMap.set(TokenDict.UNKNOWN_TOKEN_ALIAS, TokenDict.UNKNOWN_TOKEN_INDEX);
        this.indexToTokenMap.set(TokenDict.UNKNOWN_TOKEN_INDEX, TokenDict.UNKNOWN_TOKEN_ALIAS);

        if (!tokenSet) {
            return this;
        }
        tokenSet.forEach(token => this.add(token));
        return this;
    }

    decode(index: number): string {
        return this.indexToTokenMap.get(index);
    }

    encode(token: string): number {
        const index = this.tokenToIndexMap.get(token);
        if (!index) {
            return TokenDict.UNKNOWN_TOKEN_INDEX;
        }
        return index;
    }

    add(token: string) {
        if (this.tokenToIndexMap.get(token)) {
            return;
        }
        // let hashValue = murmurHash(token);
        // open address search
        // while(this.indexToTokenMap.get(hashValue)){
        //     hashValue += 1;
        // }
        const newIndex = this.indexToTokenMap.size;
        this.indexToTokenMap.set(newIndex, token);
        this.tokenToIndexMap.set(token, newIndex);
    }

    addAll(tokens: Set<string>) {
        tokens.forEach(
            token => this.add(token)
        );
    }

    encodeAll(tokens: Array<string>): Array<number> {
        return tokens.map(token => this.encode(token));
    }

    oneHotEncode(token: string): mathjs.Matrix {
        let oneHotLabel = mathjs.zeros([1, this.indexToTokenMap.size], 'sparse');
        if (oneHotLabel instanceof Array) {
            throw new AssertionError()
        }
        let index = this.tokenToIndexMap.get(token);

        if (!index) {
            index = TokenDict.UNKNOWN_TOKEN_INDEX;
        }
        oneHotLabel.set([0, index], 1);
        return oneHotLabel;
    }

    tokensToBagOfWordsVector(tokens: Array<string>): mathjs.Matrix {
        const emptyMatrix = mathjs.zeros([1, this.indexToTokenMap.size], 'sparse');
        const vector = tokens.reduce((a, b) => mathjs.add(a, this.oneHotEncode(b)), emptyMatrix);
        if (!isMatrix(vector)) {
            throw new AssertionError()
        }
        return vector;
    }
}

function isMatrix(mathObj: Matrix | mathjs.MathType): mathObj is Matrix {
    return (<Matrix>mathObj).storage !== undefined && (<Matrix>mathObj).set !== undefined;
}

function isSparseMatrix(mathObj: Matrix | mathjs.MathType): boolean {
    if (!isMatrix(mathObj)) {
        return false;
    }
    return mathObj.storage() === "sparse";
}

function normSparse(mathObj: Matrix | number | BigNumber | Complex | MathArray): BigNumber | number {
    if (isSparseMatrix(mathObj)) {
        //not defined in declaration file because "_values" is private
        return mathjs.norm((mathObj as any)._values);
    }

    return mathjs.norm(mathObj);
}
