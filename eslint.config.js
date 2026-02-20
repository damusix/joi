import * as HapiPlugin from '@hapi/eslint-plugin';

export default [
    {
        ignores: ['browser', 'dist', 'sandbox.js']
    },
    ...HapiPlugin.configs.module
];
