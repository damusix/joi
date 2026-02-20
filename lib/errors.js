import * as Annotate from './annotate.js';
import * as Common from './common.js';
import Template from './template.js';


const internals = {};


export class Report {

    constructor(code, value, local, flags, messages, state, prefs) {

        this.code = code;
        this.flags = flags;
        this.messages = messages;
        this.path = state.path;
        this.prefs = prefs;
        this.state = state;
        this.value = value;

        this.message = null;
        this.template = null;

        this.local = local || {};
        this.local.label = label(this.flags, this.state, this.prefs, this.messages);

        if (this.value !== undefined &&
            !this.local.hasOwnProperty('value')) {

            this.local.value = this.value;
        }

        if (this.path.length) {
            const key = this.path[this.path.length - 1];
            if (typeof key !== 'object') {
                this.local.key = key;
            }
        }
    }

    _setTemplate(template) {

        this.template = template;

        if (!this.flags.label &&
            this.path.length === 0) {

            const localized = this._template(this.template, 'root');
            if (localized) {
                this.local.label = localized;
            }
        }
    }

    toString() {

        if (this.message) {
            return this.message;
        }

        const code = this.code;

        if (!this.prefs.errors.render) {
            return this.code;
        }

        const tpl = this._template(this.template) ||
            this._template(this.prefs.messages) ||
            this._template(this.messages);

        if (tpl === undefined) {
            return `Error code "${code}" is not defined, your custom type is missing the correct messages definition`;
        }

        // Render and cache result

        this.message = tpl.render(this.value, this.state, this.prefs, this.local, { errors: this.prefs.errors, messages: [this.prefs.messages, this.messages] });
        if (!this.prefs.errors.label) {
            this.message = this.message.replace(/^"" /, '').trim();
        }

        return this.message;
    }

    _template(messages, code) {

        return template(this.value, messages, code || this.code, this.state, this.prefs);
    }
}


export const path = function (pathArr) {

    let pathLabel = '';
    for (const segment of pathArr) {
        if (typeof segment === 'object') {          // Exclude array single path segment
            continue;
        }

        if (typeof segment === 'string') {
            if (pathLabel) {
                pathLabel += '.';
            }

            pathLabel += segment;
        }
        else {
            pathLabel += `[${segment}]`;
        }
    }

    return pathLabel;
};


export const template = function (value, messages, code, state, prefs) {

    if (!messages) {
        return;
    }

    if (Template.isTemplate(messages)) {
        return code !== 'root' ? messages : null;
    }

    let lang = prefs.errors.language;
    if (Common.isResolvable(lang)) {
        lang = lang.resolve(value, state, prefs);
    }

    if (lang &&
        messages[lang]) {

        if (messages[lang][code] !== undefined) {
            return messages[lang][code];
        }

        if (messages[lang]['*'] !== undefined) {
            return messages[lang]['*'];
        }
    }

    if (!messages[code]) {
        return messages['*'];
    }

    return messages[code];
};


export const label = function (flags, state, prefs, messages) {

    if (!prefs.errors.label) {
        return '';
    }

    if (flags.label) {
        return flags.label;
    }

    let pathArr = state.path;
    if (prefs.errors.label === 'key' &&
        state.path.length > 1) {

        pathArr = state.path.slice(-1);
    }

    const normalized = path(pathArr);
    if (normalized) {
        return normalized;
    }

    return template(null, prefs.messages, 'root', state, prefs) ||
        messages && template(null, messages, 'root', state, prefs) ||
        'value';
};


export const process = function (errors, original, prefs) {

    if (!errors) {
        return null;
    }

    const { override, message, details: det } = details(errors);
    if (override) {
        return override;
    }

    if (prefs.errors.stack) {
        return new ValidationError(message, det, original);
    }

    const limit = Error.stackTraceLimit;
    Error.stackTraceLimit = 0;
    const validationError = new ValidationError(message, det, original);
    Error.stackTraceLimit = limit;
    return validationError;
};


export const details = function (errors, options = {}) {

    let messages = [];
    const det = [];

    for (const item of errors) {

        // Override

        if (item instanceof Error) {
            if (options.override !== false) {
                return { override: item };
            }

            const message = item.toString();
            messages.push(message);

            det.push({
                message,
                type: 'override',
                context: { error: item }
            });

            continue;
        }

        // Report

        const message = item.toString();
        messages.push(message);

        det.push({
            message,
            path: item.path.filter((v) => typeof v !== 'object'),
            type: item.code,
            context: item.local
        });
    }

    if (messages.length > 1) {
        messages = [...new Set(messages)];
    }

    return { message: messages.join('. '), details: det };
};


export class ValidationError extends Error {

    constructor(message, details, original) {

        super(message);
        this._original = original;
        this.details = details;
    }

    static isError(err) {

        return err instanceof ValidationError;
    }
}


ValidationError.prototype.isJoi = true;

ValidationError.prototype.name = 'ValidationError';

ValidationError.prototype.annotate = Annotate.error;
