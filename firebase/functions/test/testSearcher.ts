'use strict';

import {expect} from 'chai';
import 'mocha';
import {Searcher, TokenDict} from '../src/searcher';
import {matrix} from "mathjs";

describe("test TokenDict", function () {
    describe("test initialize", () => {
        it("test basic initialize", () => {
            const tokens = new Set(["a", "b", "c", "d"]);
            const sut = new TokenDict(tokens);

            const inputToken = "c";
            const expectIndex = 3;
            const inputIndex = 4;
            const expectToken = "d";

            expect(sut.encode(inputToken)).to.equal(expectIndex);
            expect(sut.decode(inputIndex)).to.equal(expectToken);
        });
    });

    describe("test one hot encoding & add twice", () => {
        it("basic token", () => {
            const sut = new TokenDict(new Set([]));

            sut.add("a");
            sut.add("b");
            sut.add("c");
            sut.add("a");

            const inputToken = "a";
            const expectedVector = matrix([[0, 1, 0, 0]], "sparse");

            expect(sut.oneHotEncode(inputToken)).deep.equal(expectedVector);
        });

        it("unkonwn token", () => {
            const sut = new TokenDict(new Set([]));

            sut.add("a");
            sut.add("b");
            sut.add("c");

            const inputToken = "d";
            const expectedVector = matrix([[1, 0, 0, 0]], "sparse");

            expect(sut.oneHotEncode(inputToken)).deep.equal(expectedVector);
        });
    });

    describe("test bagofwords vector", () => {
        it("basic tokens", () => {
            const sut = new TokenDict(new Set(["a", "b", "c"]));

            const inputTokens = ["a", "d", "a", "c"];

            const expectedVector = matrix([[1, 2, 0, 1]], "sparse");

            expect(sut.tokensToBagOfWordsVector(inputTokens)).deep.equal(expectedVector);
        });
    });
});

describe("test Searcher", () => {

    describe("cosine similarity", () => {
        it('non-zero norm vector', () => {
            const inputVectors = [
                matrix([[2, 2, 2, 2]], "sparse"),
                matrix([[1, 1, 1, 1]], "sparse")
            ];

            const expected = 1;
            expect(Searcher.computeCosineSimilarity(inputVectors[0], inputVectors[1])).to.equal(expected);
        });

        it('zero norm vector', () => {
            const inputVectors = [
                matrix([[0, 0, 0, 0]], "sparse"),
                matrix([[1, 1, 1, 1]], "sparse")
            ];

            const expected = 0;
            expect(Searcher.computeCosineSimilarity(inputVectors[0], inputVectors[1])).to.equal(expected);
        });
    });
    //
    // describe("search by bag of words cosign similarity", () => {
    //     it('', () => {
    //         const inputTokensMap = new Map(
    //             ["", ]
    //         );
    //     });
    // })
    describe("construct index", () => {
        it("basic textMap ", (done) => {
            const sut = new Searcher();
            const inputIdTextMap = new Map(
                [[100, "すもももももものうちで、ももは果物です。"],
                    [200, "すもももレモンもすっぱいです。"]
                ]
            );

            sut.add(inputIdTextMap).then(
                () => {
                    const expectedIndex = matrix([[0, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
                        [0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1]], 'sparse');
                    // assertion fails if they are sparse matrix
                    expect(sut.bagOfWordsIndex.toArray()).deep.equal(expectedIndex.toArray());

                    const expectedDocIds = [100, 200];
                    expect(sut.docIds).deep.equal(expectedDocIds);
                    done();
                });
        });
    });

    describe("search by cosine similarity", () => {
        it("basic textMap ", (done) => {
            const sut = new Searcher();
            const inputIdTextMap = new Map(
                [[100, "すもももももものうちで、ももは果物です。"],
                    [200, "すもももレモンもすっぱいです。"],
                    [300, "洗濯をする"],
                    [400, "手紙をポストに投函する"],
                    [500, "掃除をする"],
                    [600, "カーペットの洗濯"],
                    [700, "食器を洗う"],
                    [800, "ゴミ出し"]
                ]
            );

            const query = "ホットカーペットを洗濯する";


            sut.add(inputIdTextMap)
                .then(() => {
                    return Promise.resolve(sut.searchByCosineSimilarity(query, 3));
                }).then(
                (candidates) => {
                    const expectedDocIds = [300, 500, 600];
                    expect(candidates.map((value) => value.docId)).deep.equal(expectedDocIds);
                    done();
                }
            );
        });
    });
});

