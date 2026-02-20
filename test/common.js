import * as Code from "@hapi/code";
import * as Lab from "@hapi/lab";

import * as Common from "../lib/common.js";


const internals = {};


const lab = Lab.script();
export { lab };
const { describe, it } = lab;
const { expect } = Code;


describe('Common', () => {

    describe('assertOptions', () => {

        it('validates null', () => {

            expect(() => Common.assertOptions()).to.throw('Options must be of type object');
        });
    });
});
