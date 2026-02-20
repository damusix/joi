import { assert } from '@hapi/hoek';

import * as Common from './common.js';
import * as Ref from './ref.js';


const internals = {};



export class Ids {

    constructor() {

        this._byId = new Map();
        this._byKey = new Map();
        this._schemaChain = false;
    }

    clone() {

        const clone = new Ids();
        clone._byId = new Map(this._byId);
        clone._byKey = new Map(this._byKey);
        clone._schemaChain = this._schemaChain;
        return clone;
    }

    concat(source) {

        if (source._schemaChain) {
            this._schemaChain = true;
        }

        for (const [id, value] of source._byId.entries()) {
            assert(!this._byKey.has(id), 'Schema id conflicts with existing key:', id);
            this._byId.set(id, value);
        }

        for (const [key, value] of source._byKey.entries()) {
            assert(!this._byId.has(key), 'Schema key conflicts with existing id:', key);
            this._byKey.set(key, value);
        }
    }

    fork(path, adjuster, root) {

        const chain = this._collect(path);
        chain.push({ schema: root });
        const tail = chain.shift();
        let adjusted = { id: tail.id, schema: adjuster(tail.schema) };

        assert(Common.isSchema(adjusted.schema), 'adjuster function failed to return a joi schema type');

        for (const node of chain) {
            adjusted = { id: node.id, schema: internals.fork(node.schema, adjusted.id, adjusted.schema) };
        }

        return adjusted.schema;
    }

    labels(path, behind = []) {

        const current = path[0];
        const node = this._get(current);
        if (!node) {
            return [...behind, ...path].join('.');
        }

        const forward = path.slice(1);
        behind = [...behind, node.schema._flags.label || current];
        if (!forward.length) {
            return behind.join('.');
        }

        return node.schema._ids.labels(forward, behind);
    }

    reach(path, behind = []) {

        const current = path[0];
        const node = this._get(current);
        assert(node, 'Schema does not contain path', [...behind, ...path].join('.'));

        const forward = path.slice(1);
        if (!forward.length) {
            return node.schema;
        }

        return node.schema._ids.reach(forward, [...behind, current]);
    }

    register(schemaArg, { key } = {}) {

        if (!schemaArg ||
            !Common.isSchema(schemaArg)) {

            return;
        }

        if (schemaArg.$_property('schemaChain') ||
            schemaArg._ids._schemaChain) {

            this._schemaChain = true;
        }

        const id = schemaArg._flags.id;
        if (id) {
            const existing = this._byId.get(id);
            assert(!existing || existing.schema === schemaArg, 'Cannot add different schemas with the same id:', id);
            assert(!this._byKey.has(id), 'Schema id conflicts with existing key:', id);

            this._byId.set(id, { schema: schemaArg, id });
        }

        if (key) {
            assert(!this._byKey.has(key), 'Schema already contains key:', key);
            assert(!this._byId.has(key), 'Schema key conflicts with existing id:', key);

            this._byKey.set(key, { schema: schemaArg, id: key });
        }
    }

    reset() {

        this._byId = new Map();
        this._byKey = new Map();
        this._schemaChain = false;
    }

    _collect(path, behind = [], nodes = []) {

        const current = path[0];
        const node = this._get(current);
        assert(node, 'Schema does not contain path', [...behind, ...path].join('.'));

        nodes = [node, ...nodes];

        const forward = path.slice(1);
        if (!forward.length) {
            return nodes;
        }

        return node.schema._ids._collect(forward, [...behind, current], nodes);
    }

    _get(id) {

        return this._byId.get(id) || this._byKey.get(id);
    }
}


internals.fork = function (schemaArg, id, replacement) {

    const each = (item, { key }) => {

        if (id === (item._flags.id || key)) {
            return replacement;
        }
    };

    const obj = schema(schemaArg, { each, ref: false });
    return obj ? obj.$_mutateRebuild() : schemaArg;
};


export const schema = function (schemaArg, options) {

    let obj;

    for (const name in schemaArg._flags) {
        if (name[0] === '_') {
            continue;
        }

        const result = internals.scan(schemaArg._flags[name], { source: 'flags', name }, options);
        if (result !== undefined) {
            obj = obj || schemaArg.clone();
            obj._flags[name] = result;
        }
    }

    for (let i = 0; i < schemaArg._rules.length; ++i) {
        const rule = schemaArg._rules[i];
        const result = internals.scan(rule.args, { source: 'rules', name: rule.name }, options);
        if (result !== undefined) {
            obj = obj || schemaArg.clone();
            const clone = Object.assign({}, rule);
            clone.args = result;
            obj._rules[i] = clone;

            const existingUnique = obj._singleRules.get(rule.name);
            if (existingUnique === rule) {
                obj._singleRules.set(rule.name, clone);
            }
        }
    }

    for (const name in schemaArg.$_terms) {
        if (name[0] === '_') {
            continue;
        }

        const result = internals.scan(schemaArg.$_terms[name], { source: 'terms', name }, options);
        if (result !== undefined) {
            obj = obj || schemaArg.clone();
            obj.$_terms[name] = result;
        }
    }

    return obj;
};


internals.scan = function (item, source, options, _path, _key) {

    const path = _path || [];

    if (item === null ||
        typeof item !== 'object') {

        return;
    }

    let clone;

    if (Array.isArray(item)) {
        for (let i = 0; i < item.length; ++i) {
            const key = source.source === 'terms' && source.name === 'keys' && item[i].key;
            const result = internals.scan(item[i], source, options, [i, ...path], key);
            if (result !== undefined) {
                clone = clone || item.slice();
                clone[i] = result;
            }
        }

        return clone;
    }

    if (options.schema !== false && Common.isSchema(item) ||
        options.ref !== false && Ref.isRef(item)) {

        const result = options.each(item, { ...source, path, key: _key });
        if (result === item) {
            return;
        }

        return result;
    }

    for (const key in item) {
        if (key[0] === '_') {
            continue;
        }

        const result = internals.scan(item[key], source, options, [key, ...path], _key);
        if (result !== undefined) {
            clone = clone || Object.assign({}, item);
            clone[key] = result;
        }
    }

    return clone;
};
