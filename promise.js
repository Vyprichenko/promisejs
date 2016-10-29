/*
 *  Copyright 2012-2013 (c) Pierre Duquesne <stackp@online.fr>
 *  Licensed under the New BSD License.
 *  https://github.com/stackp/promisejs
 */

/** @module promise */

(function (exports) {

    /**
     * @constructor
     * @alias module:promise.Promise
     */
    function Promise() {
        this._callbacks = [];
        this._isdone = false;
        this.result = [];
    }

    /**
     * Adds callback to the Promise object
     * @param {Function} callback
     * @param {Promise} [context]
     * @returns {Promise} that is resolved when the callback resolves its promise
     */
    Promise.prototype.then = function (callback, context) {
        var p = new Promise();

        function resolve() {
            var result = callback.apply(context, arguments);
            if (result instanceof Promise) {
                result.then(p.done, p);
            }
            else {
                p.done(result);
            }
        }

        this._isdone
            ? resolve.apply(null, this.result)
            : this._callbacks.push(resolve);

        return p;
    }

    /**
     * Resolves a Promise object and calls any callbacks
     * with the given arguments
     * @returns {Promise}
     */
    Promise.prototype.done = function () {
        this.result = arguments;
        this._isdone = true;
        for (var i = 0; i < this._callbacks.length; i++) {
            this._callbacks[i].apply(null, this.result);
        }
        this._callbacks.length = 0;
        return this;
    }

    /**
     * The callback will be passed an array containing the values passed by each promise,
     * in the same order that the promises were given
     * @alias module:promise.join
     * @param {Promise[]} promises
     * @returns {Promise} that is resolved once all the arguments are resolved
     */
    function join(promises) {
        var p = new Promise();
        var results = [];
        var resolved = 0;

        promises && promises.length > 0
            ? promises.forEach(notify)
            : p.done(results);

        function notify(pp, i, ps) {
            pp.then(function () {
                resolved++;
                results[i] = Array.prototype.slice.call(arguments);
                if (resolved == ps.length) {
                    p.done(results);
                }
            });
        }
        return p;
    }

    /**
     * Chains asynchronous functions that return a promise each
     * @alias module:promise.chain
     * @param {Function[]} callbacks
     * @param {Array} [args]
     * @returns {Promise} that is resolved once all the arguments are resolved
     */
    function chain(callbacks, args) {
        var p = new Promise();
        if (callbacks && callbacks.length) {
            callbacks[0].apply(null, args).then(function (error, result) {
                chain(callbacks.slice(1), arguments).then(
                    function () {
                        p.done.apply(p, arguments);
                    }
                );
            });
        }
        else {
            p.done.apply(p, args);
        }
        return p;
    }

    /* AJAX requests */

    /**
     * Encodes data in accordance with the content type
     * Strings and FormData objects are returned unchanged
     * @param {*} data
     * @param {string} [type]
     * @returns {(string|FormData)}
     */
    function encode(data, type) {
        if (data instanceof FormData) {
            return data;
        }
        if (typeof data != 'object' || data === null) {
            return data || '';
        }
        switch (type) {

            case 'application/json':
                return JSON.stringify(data);

            case 'text/plain':
                return Object.keys(data).map(
                    function (name) {
                        return name + '=' + data[name];
                    }
                ).join('\r\n');

            default/* application/x-www-form-urlencoded */:
                return Object.keys(data).map(
                    function (name) {
                        return encodeURIComponent(name) + '=' + encodeURIComponent(data[name]);
                    }
                ).join('&');
        }
    }

    /**
     * @returns {(XMLHttpRequest|ActiveXObject)}
     * @throws Unable to create ActiveXObject
     */
    function new_xhr() {
        var xhr;
        if (window.XMLHttpRequest) {
            xhr = new XMLHttpRequest();
        }
        else if (window.ActiveXObject) {
            try {
                xhr = new ActiveXObject('Msxml2.XMLHTTP');
            }
            catch (e) {
                xhr = new ActiveXObject('Microsoft.XMLHTTP');
            }
        }
        return xhr;
    }

    /**
     * @alias module:promise.ajax
     * @param {string} method
     * @param {string} url
     * @param {*} [data]
     * @param {Object} [headers]
     * @returns {Promise}
     */
    function ajax(method, url, data, headers) {
        var p = new Promise();
        var xhr, payload = null;

        try {
            xhr = new_xhr();
        }
        catch (e) {
            p.done(promise.ENOXHR, '');
            return p;
        }

        // List of content types which can be used
        // to encode data if Content-Type header matches one of them
        // The first one is used by default
        var supportedTypes = [
            'application/x-www-form-urlencoded',
            'application/json',
            'text/plain'
        ];

        // Content-Type of the current request
        // or default value if not specified
        var contentType = (
            headers && headers[Object.keys(headers).filter(
                function (h) {
                    return h.toLowerCase() == 'content-type';
                }
            )[0]]
        ) || supportedTypes[0];

        // GET request data is always urlencoded and attached to the url
        if (method.toUpperCase() == 'GET') {
            xhr.open(method, url + (data ? '?' + encode(data) : ''));
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        }
        // FormData object sets Content-Type to multipart/form-data
        // custom Content-Type header should be ignored
        else if (data instanceof FormData) {
            xhr.open(method, url);
            payload = data;
        }
        // User-defined Content-Type or default value is used
        // Data is encoded depending on Content-Type
        // which is matched with one of the supported
        else {
            xhr.open(method, url);
            xhr.setRequestHeader('Content-Type', contentType);
            payload = encode(data, supportedTypes.filter(
                function (type) {
                    return contentType.match(new RegExp(type, 'i'));
                }
            )[0]);
        }

        for (var h in headers) {
            if (headers.hasOwnProperty(h) && h.toLowerCase() != 'content-type') {
                xhr.setRequestHeader(h, headers[h]);
            }
        }

        function onTimeout() {
            xhr.abort();
            p.done(promise.ETIMEOUT, '', xhr);
        }

        var timeout = promise.ajaxTimeout;
        if (timeout) {
            var tid = setTimeout(onTimeout, timeout);
        }

        xhr.onreadystatechange = function () {
            if (timeout) {
                clearTimeout(tid);
            }
            if (xhr.readyState == 4) {
                var err = (
                    !xhr.status ||
                    (xhr.status < 200 || xhr.status >= 300) &&
                    xhr.status !== 304
                );
                p.done(err, xhr.responseText, xhr);
            }
        }

        xhr.send(payload);
        return p;
    }

    /**
     * @param {string} method
     * @returns {Function}
     */
    function _ajaxer(method) {
        return function (url, data, headers) {
            return ajax(method, url, data, headers);
        }
    }

    var promise = {
        Promise: Promise,
        join: join,
        chain: chain,
        ajax: ajax,
        encode: encode,
        get: _ajaxer('GET'),
        post: _ajaxer('POST'),
        put: _ajaxer('PUT'),
        put: _ajaxer('PATCH'),
        del: _ajaxer('DELETE'),

        /* Error codes */
        ENOXHR: 1,
        ETIMEOUT: 2,

        /**
         * Configuration parameter: time in milliseconds after which a
         * pending AJAX request is considered unresponsive and is
         * aborted. Useful to deal with bad connectivity (e.g. on a
         * mobile network). A 0 value disables AJAX timeouts.
         *
         * Aborted requests resolve the promise with a ETIMEOUT error
         * code.
         */
        ajaxTimeout: 0
    }

    if (typeof define === 'function' && define.amd) {
        /* AMD support */
        define(function () {
            return promise;
        });
    }
    else {
        exports.promise = promise;
    }

})(this);