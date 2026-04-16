let data;
let editor;
let versionid;
let language = 'json';

let monacoUrl = chrome.runtime.getURL('/') + 'js/monaco/vs';
require.config({
    paths: {
        'vs': monacoUrl
    }
});

const params = new URLSearchParams(window.location.search);
let setting = params.get('setting') || "slashsswitches";
setting = ["slashsswitches","slashcommands","monacooptions"].includes(setting) ? setting : "slashsswitches";

let theme = "vs-dark";
let title = "Settings Editor - " + setting;

document.title = title;
document.getElementById('title').innerText = title;
require(['vs/editor/editor.main'], () => {

    editor = monaco.editor.create(document.getElementById('container'), {
        automaticLayout: true,
        language: language,
        theme: theme,
        wordWrap: "on",
        colorDecorators: true,
        "bracketPairColorization.enabled": true
    });

    addActions(editor);

    getFromSyncStorageGlobal("snusettings", function (data) {
        let snusettings = data || {};
        editor.setValue(snusettings[setting]);
        setTimeout(() => {
            editor.getAction('editor.action.formatDocument').run();
            editor.focus();
        }, 100);
        versionid = getEditor().getModel().getAlternativeVersionId();
    })

});


document.querySelector('button#save').addEventListener('click', e => {
    saveSettings();
});

// Add functionality for the download link
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('downloadContent').addEventListener('click', function(e) {
        e.preventDefault();
        downloadEditorContent();
    });
});

/**
 * Downloads the editor content as a text file
 */
function downloadEditorContent() {
    // Get monaco editor content from the global editor variable
    let content = '';
    if (typeof editor !== 'undefined' && editor) {
        content = editor.getValue();
    }
    
    // Get the setting name from URL parameters to use as filename
    const params = new URLSearchParams(window.location.search);
    const settingName = params.get('setting') || 'settings';
    
    // Create download link
    const blob = new Blob([content], {type: 'text/plain'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = settingName + '.json.txt';
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    setTimeout(function() {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

function addActions(editor) {

    const blockContext = "editorTextFocus && !suggestWidgetVisible && !renameInputVisible && !inSnippetMode && !quickFixWidgetVisible";
    editor.addAction({
        id: "updateRecord",
        label: "Save",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        contextMenuGroupId: "2_execution",
        precondition: blockContext,
        run: () => {
            saveSettings();
        },
    });

    editor.addAction({
        id: "google",
        label: "Search Google",
        contextMenuGroupId: "2_execution",
        precondition: "editorHasSelection",
        run: (editor) => {
            let selection = getEditor().getModel().getValueInRange(editor.getSelection());
            window.open('https://www.google.com/search?q=' + selection);
        }
    })

}


function getEditor() {
    return (typeof editor.getValue !== 'undefined') ?
        editor : editor.getModifiedEditor();
}



// Expose dirty check and save function for Electron main process to handle close confirmation
window.snuIsDirty = function() {
    if (!editor) return false;
    return versionid != getEditor().getModel().getAlternativeVersionId();
};

window.snuSave = function() {
    saveSettings();
    return true;
};

// Remove the default browser prompt in favor of our native Electron dialog
window.onbeforeunload = null;




//get an instance independent sync parameter
function getFromSyncStorageGlobal(theName, callback) {
    chrome.storage.sync.get(theName, function (resSync) {
        var dataSync = resSync[theName];

        if (typeof dataSync !== 'object'){ //only objects can become large and merged.
            callback(dataSync);
            return;
        }

        getFromChromeStorageGlobal(theName,function (resLocal) {
            var objLocal = resLocal || {};
            var objMerged = { ...dataSync, ...objLocal};
            callback(objMerged);
        });
    });
}

//get an instance independent global parameter
function getFromChromeStorageGlobal(theName, callback) {
    chrome.storage.local.get(theName, function (result) {
        callback(result[theName]);
    });
}

function saveSettings() {

    let jsonSetting;
    let minifiedSetting;

    try {
        jsonSetting = JSON.parse(editor.getValue());
        minifiedSetting  = JSON.stringify(jsonSetting);
    } catch (e) {
        document.querySelector('#response').innerHTML = `Error: Invalid JSON`;
        document.querySelector('#response').title = `Error: ${e}`;
        return;
    }

    getFromSyncStorageGlobal("snusettings", function (data) { //get the current settings in case it was edited in the popup
        snusettingsSync = data || {};
        snusettingsSync[setting] = minifiedSetting;
        snusettings = {};

        try {
            Object.keys(snusettingsSync).forEach(key => {
                if (snusettingsSync[key].length >= 5000) { //overflow to local storage #204
                    snusettings[key] = '' + snusettingsSync[key];
                    delete snusettingsSync[key];
                }
            });

            setToChromeSyncStorageGlobal("snusettings", snusettingsSync);
            setToChromeStorageGlobal("snusettings", snusettings);
            
            document.querySelector('#response').innerHTML = `Saved: ${new Date().toLocaleTimeString()}`;
            versionid = getEditor().getModel().getAlternativeVersionId();
        } catch (e) {
            document.querySelector('#response').innerHTML = `Error: ${e}`;
        }

    })
    
}

//set an instance independent sync parameter
function setToChromeSyncStorageGlobal(theName, theValue) {
    var myobj = {};
    myobj[theName] = theValue;
    chrome.storage.sync.set(myobj, function () {

    });
}

//set an instance independent parameter
function setToChromeStorageGlobal(theName, theValue) {
    //console.log(theName, theValue)
    var myobj = {};
    myobj[theName] = theValue;
    chrome.storage.local.set(myobj, function () {
    });
}
