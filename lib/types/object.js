import Keys from './keys.js';


const internals = {};


export default Keys.extend({

    type: 'object',

    cast: {
        map: {
            from: (value) => value && typeof value === 'object',
            to(value, helpers) {

                return new Map(Object.entries(value));
            }
        }
    }
});
