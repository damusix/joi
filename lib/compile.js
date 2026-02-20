import { assert } from '@hapi/hoek';

import * as Common from './common.js';
import * as Ref from './ref.js';


const internals = {};


export const schema = function (Joi, config, options = {}) {

    Common.assertOptions(options, ['appendPath', 'override']);

    try {
        return internals.schema(Joi, config, options);
    }
    catch (err) {
        if (options.appendPath &&
            err.path !== undefined) {

            err.message = `${err.message} (${err.path})`;
        }

        throw err;
    }
};


internals.schema = function (Joi, config, options) {

    assert(config !== undefined, 'Invalid undefined schema');

    if (Array.isArray(config)) {
        assert(config.length, 'Invalid empty array schema');

        if (config.length === 1) {
            config = config[0];
        }
    }

    const valid = (base, ...values) => {

        if (options.override !== false) {
            return base.valid(Joi.override, ...values);
        }

        return base.valid(...values);
    };

    if (internals.simple(config)) {
        return valid(Joi, config);
    }

    if (typeof config === 'function') {
        return Joi.custom(config);
    }

    assert(typeof config === 'object', 'Invalid schema content:', typeof config);

    if (Common.isResolvable(config)) {
        return valid(Joi, config);
    }

    if (Common.isSchema(config)) {
        return config;
    }

    if (Array.isArray(config)) {
        for (const item of config) {
            if (!internals.simple(item)) {
                return Joi.alternatives().try(...config);
            }
        }

        return valid(Joi, ...config);
    }

    if (config instanceof RegExp) {
        return Joi.string().regex(config);
    }

    if (config instanceof Date) {
        return valid(Joi.date(), config);
    }

    assert(Object.getPrototypeOf(config) === Object.getPrototypeOf({}), 'Schema can only contain plain objects');

    return Joi.object().keys(config);
};


export const ref = function (id, options) {

    return Ref.isRef(id) ? id : Ref.create(id, options);
};


export const compile = function (root, schemaArg, options = {}) {

    Common.assertOptions(options, ['legacy']);

    // Compiled by any supported version

    const any = schemaArg && schemaArg[Common.symbols.any];
    if (any) {
        assert(options.legacy || any.version === Common.version, 'Cannot mix different versions of joi schemas:', any.version, Common.version);
        return schemaArg;
    }

    // Uncompiled root

    if (typeof schemaArg !== 'object' ||
        !options.legacy) {

        return schema(root, schemaArg, { appendPath: true });          // Will error if schema contains other versions
    }

    // Scan schema for compiled parts

    const compiler = internals.walk(schemaArg);
    if (!compiler) {
        return schema(root, schemaArg, { appendPath: true });
    }

    return compiler.compile(compiler.root, schemaArg);
};


internals.walk = function (schemaArg) {

    if (typeof schemaArg !== 'object') {
        return null;
    }

    if (Array.isArray(schemaArg)) {
        for (const item of schemaArg) {
            const compiler = internals.walk(item);
            if (compiler) {
                return compiler;
            }
        }

        return null;
    }

    const any = schemaArg[Common.symbols.any];
    if (any) {
        return { root: schemaArg[any.root], compile: any.compile };
    }

    assert(Object.getPrototypeOf(schemaArg) === Object.getPrototypeOf({}), 'Schema can only contain plain objects');

    for (const key in schemaArg) {
        const compiler = internals.walk(schemaArg[key]);
        if (compiler) {
            return compiler;
        }
    }

    return null;
};


internals.simple = function (value) {

    return value === null || ['boolean', 'string', 'number'].includes(typeof value);
};


export const when = function (schemaArg, condition, options) {

    if (options === undefined) {
        assert(condition && typeof condition === 'object', 'Missing options');

        options = condition;
        condition = Ref.create('.');
    }

    if (Array.isArray(options)) {
        options = { switch: options };
    }

    Common.assertOptions(options, ['is', 'not', 'then', 'otherwise', 'switch', 'break']);

    // Schema condition

    if (Common.isSchema(condition)) {
        assert(options.is === undefined, '"is" can not be used with a schema condition');
        assert(options.not === undefined, '"not" can not be used with a schema condition');
        assert(options.switch === undefined, '"switch" can not be used with a schema condition');

        return internals.condition(schemaArg, { is: condition, then: options.then, otherwise: options.otherwise, break: options.break });
    }

    // Single condition

    assert(Ref.isRef(condition) || typeof condition === 'string', 'Invalid condition:', condition);
    assert(options.not === undefined || options.is === undefined, 'Cannot combine "is" with "not"');

    if (options.switch === undefined) {
        let rule = options;
        if (options.not !== undefined) {
            rule = { is: options.not, then: options.otherwise, otherwise: options.then, break: options.break };
        }

        let is = rule.is !== undefined ? schemaArg.$_compile(rule.is) : schemaArg.$_root.invalid(null, false, 0, '').required();
        assert(rule.then !== undefined || rule.otherwise !== undefined, 'options must have at least one of "then", "otherwise", or "switch"');
        assert(rule.break === undefined || rule.then === undefined || rule.otherwise === undefined, 'Cannot specify then, otherwise, and break all together');

        if (options.is !== undefined &&
            !Ref.isRef(options.is) &&
            !Common.isSchema(options.is)) {

            is = is.required();                     // Only apply required if this wasn't already a schema or a ref
        }

        return internals.condition(schemaArg, { ref: ref(condition), is, then: rule.then, otherwise: rule.otherwise, break: rule.break });
    }

    // Switch statement

    assert(Array.isArray(options.switch), '"switch" must be an array');
    assert(options.is === undefined, 'Cannot combine "switch" with "is"');
    assert(options.not === undefined, 'Cannot combine "switch" with "not"');
    assert(options.then === undefined, 'Cannot combine "switch" with "then"');

    const rule = {
        ref: ref(condition),
        switch: [],
        break: options.break
    };

    for (let i = 0; i < options.switch.length; ++i) {
        const test = options.switch[i];
        const last = i === options.switch.length - 1;

        Common.assertOptions(test, last ? ['is', 'then', 'otherwise'] : ['is', 'then']);

        assert(test.is !== undefined, 'Switch statement missing "is"');
        assert(test.then !== undefined, 'Switch statement missing "then"');

        const item = {
            is: schemaArg.$_compile(test.is),
            then: schemaArg.$_compile(test.then)
        };

        if (!Ref.isRef(test.is) &&
            !Common.isSchema(test.is)) {

            item.is = item.is.required();           // Only apply required if this wasn't already a schema or a ref
        }

        if (last) {
            assert(options.otherwise === undefined || test.otherwise === undefined, 'Cannot specify "otherwise" inside and outside a "switch"');
            const otherwise = options.otherwise !== undefined ? options.otherwise : test.otherwise;
            if (otherwise !== undefined) {
                assert(rule.break === undefined, 'Cannot specify both otherwise and break');
                item.otherwise = schemaArg.$_compile(otherwise);
            }
        }

        rule.switch.push(item);
    }

    return rule;
};


internals.condition = function (schemaArg, condition) {

    for (const key of ['then', 'otherwise']) {
        if (condition[key] === undefined) {
            delete condition[key];
        }
        else {
            condition[key] = schemaArg.$_compile(condition[key]);
        }
    }

    return condition;
};
