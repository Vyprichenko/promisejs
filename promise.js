/*
 *  Copyright 2012-2013 (c) Pierre Duquesne <stackp@online.fr>
 *  Licensed under the New BSD License.
 *  https://github.com/stackp/promisejs
 */

(function (exports) {

    function Promise() {
        this._callbacks = [];
        this._isdone = false;
        this.result = [];
    }

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

    Promise.prototype.done = function () {
        this.result = arguments;
        this._isdone = true;
        for (var i = 0; i < this._callbacks.length; i++) {
            this._callbacks[i].apply(null, this.result);
        }
        this._callbacks.length = 0;
        return this;
    }

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

    /*
     * AJAX requests
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

        var supportedTypes = [
            'application/x-www-form-urlencoded',
            'application/json',
            'text/plain'
        ];

        var contentType = (
            headers && headers[Object.keys(headers).filter(
                function (h) {
                    return h.toLowerCase() == 'content-type';
                }
            )[0]]
        ) || supportedTypes[0];

        if (method.toUpperCase() == 'GET') {
            xhr.open(method, url + (data ? '?' + encode(data) : ''));
            xhr.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
        }
        else if (data instanceof FormData) {
            xhr.open(method, url);
            payload = data;
        }
        else {
            xhr.open(method, url);
            xhr.setRequestHeader('Content-type', contentType);
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