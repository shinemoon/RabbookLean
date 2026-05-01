(function () {
    function cloneJsonSafe(obj) {
        try {
            return JSON.parse(JSON.stringify(obj));
        } catch (e) {
            return obj;
        }
    }

    function runUserScript(payload, scriptText) {
        var loadedContent = cloneJsonSafe(payload || {});
        if (!scriptText || !scriptText.trim()) {
            return { ok: true, payload: loadedContent };
        }

        var runner = new Function('loadedContent', '"use strict";\n' + scriptText + '\nreturn loadedContent;');
        var result = runner(loadedContent);
        if (result == null) {
            result = loadedContent;
        }
        return { ok: true, payload: cloneJsonSafe(result) };
    }

    function reply(message) {
        window.parent.postMessage(message, '*');
    }

    window.addEventListener('message', function (event) {
        var msg = event.data || {};
        if (msg.channel !== 'rabbook-sandbox' || msg.type !== 'run') {
            return;
        }

        try {
            var runResult = runUserScript(msg.payload, msg.script || '');
            reply({
                channel: 'rabbook-sandbox',
                type: 'result',
                requestId: msg.requestId,
                ok: runResult.ok,
                payload: runResult.payload,
                error: null
            });
        } catch (e) {
            reply({
                channel: 'rabbook-sandbox',
                type: 'result',
                requestId: msg.requestId,
                ok: false,
                payload: msg.payload || null,
                error: e.message || String(e)
            });
        }
    });

    reply({
        channel: 'rabbook-sandbox',
        type: 'ready'
    });
})();
