window.addEventListener('error', function(e) {
    let div = document.createElement('div');
    div.style.cssText = 'position:fixed; top:10px; left:10px; background:red; color:white; padding:10px; z-index:9999; font-size:12px;';
    div.innerText = 'ERROR: ' + e.message + ' at ' + (e.filename || 'unknown') + ':' + e.lineno;
    document.body.appendChild(div);
});
window.addEventListener('unhandledrejection', function(e) {
    let div = document.createElement('div');
    div.style.cssText = 'position:fixed; top:50px; left:10px; background:darkred; color:white; padding:10px; z-index:9999; font-size:12px;';
    let msg = e.reason && e.reason.message ? e.reason.message : e.reason;
    if (e.reason && e.reason.stack) msg += '\n\n' + e.reason.stack;
    div.innerText = 'PROMISE REJECTION: ' + msg;
    document.body.appendChild(div);
});
