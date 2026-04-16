let data;
let editor;
let versionid;
let theme = "vs-dark";

var monacoUrl = chrome.runtime.getURL('/') + 'js/monaco/vs';
// if (navigator.userAgent.toLowerCase().includes('firefox')) { //fix to allow autocomplete issue FF #134, didnt work :(
//     monacoUrl = 'https://snutils.com/js/monaco/0.33/vs';
// }


require.config({
    paths: {
        'vs': monacoUrl
    }
});


require(['vs/editor/editor.main'], () => {
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
        noLib: true,
        allowNonTsExtensions: true
    });

    monaco.languages.typescript.javascriptDefaults.addExtraLib(client);
    monaco.languages.typescript.javascriptDefaults.addExtraLib(serverscoped);
    monaco.languages.typescript.javascriptDefaults.addExtraLib(glidequery);

    // Configure TypeScript language service with custom formatting options
    // Since Monaco Editor doesn't expose insertSpaceBeforeFunctionParenthesis,
    // we register a format provider that removes spaces before function parentheses
    // but preserves spaces after JavaScript keywords (if, for, while, etc.)
    const jsKeywords = ['if', 'else', 'while', 'for', 'switch', 'catch', 'with', 'return', 'throw', 'typeof', 'instanceof', 'delete', 'void', 'new', 'await', 'case', 'function'];
    const removeSpaceBeforeParen = (text) => text.replace(/(\b\w+)\s+\(/g, (match, word) => 
        jsKeywords.includes(word) ? match : word + '('
    );
    
    // Document formatting provider (handles Format Document command)
    monaco.languages.registerDocumentFormattingEditProvider('javascript', {
        provideDocumentFormattingEdits: function(model, options, token) {
            const text = model.getValue();
            const formattedText = removeSpaceBeforeParen(text);
            
            if (text !== formattedText) {
                return [{
                    range: model.getFullModelRange(),
                    text: formattedText
                }];
            }
            return [];
        }
    });

    // Range formatting provider (handles Format Selection command)
    monaco.languages.registerDocumentRangeFormattingEditProvider('javascript', {
        provideDocumentRangeFormattingEdits: function(model, range, options, token) {
            const text = model.getValueInRange(range);
            const formattedText = removeSpaceBeforeParen(text);
            
            if (text !== formattedText) {
                return [{
                    range: range,
                    text: formattedText
                }];
            }
            return [];
        }
    });

    monaco.languages.registerOnTypeFormattingEditProvider('javascript', {
        autoFormatTriggerCharacters: ['('],
        provideOnTypeFormattingEdits: function(model, position, ch, options, token) {
            if (ch === '(') {
                const line = model.getLineContent(position.lineNumber);
                const beforeParen = line.substring(0, position.column - 1);
                
                // Check if there's a space before the parenthesis and it's not a keyword
                const match = beforeParen.match(/(\b\w+)\s+$/);
                if (match && !jsKeywords.includes(match[1])) {
                    const range = {
                        startLineNumber: position.lineNumber,
                        startColumn: position.column - 2,  // Position of the space
                        endLineNumber: position.lineNumber,
                        endColumn: position.column - 1     // Position just before the parenthesis
                    };
                    
                    return [{
                        range: range,
                        text: ''  // Remove the space
                    }];
                }
            }
            return [];
        }
    });

    editor = monaco.editor.create(document.getElementById('container'), {
        automaticLayout: true,
        value: '',
        language: 'javascript',
        theme: theme,
        formatOnType: true,
        formatOnPaste: true
    });

    const blockContext = "editorTextFocus && !suggestWidgetVisible && !renameInputVisible && !inSnippetMode && !quickFixWidgetVisible";
    editor.addAction({
        id: "updateRecord",
        label: "Save",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        contextMenuGroupId: "2_execution",
        precondition: blockContext,
        run: () => {
            updateRecord();
        },
    });

    editor.addAction({
        id: "google",
        label: "Search Google",
        contextMenuGroupId: "2_execution",
        precondition: "editorHasSelection",
        run: (editor) => {
            let selection = editor.getModel().getValueInRange(editor.getSelection());
            window.open('https://www.google.com/search?q=' + selection);
        }
    })


    editor.addAction({
        id: "1_javascript",
        label: "Set to Javascript",
        contextMenuGroupId: "3_lang",
        run: (editor) => {
            monaco.editor.setModelLanguage(editor.getModel(), "javascript");
        }
    })
    editor.addAction({
        id: "2_json",
        label: "Set to JSON",
        contextMenuGroupId: "3_lang",
        run: (editor) => {
            monaco.editor.setModelLanguage(editor.getModel(), "json");
        }
    })
    editor.addAction({
        id: "3_html",
        label: "Set to HTML",
        contextMenuGroupId: "3_lang",
        run: (editor) => {
            monaco.editor.setModelLanguage(editor.getModel(), "html");
        }
    })
    editor.addAction({
        id: "4_xml",
        label: "Set to XML",
        contextMenuGroupId: "3_lang",
        run: (editor) => {
            monaco.editor.setModelLanguage(editor.getModel(), "xml");
        }
    })
    editor.addAction({
        id: "5_scss",
        label: "Set to CSS",
        contextMenuGroupId: "3_lang",
        run: (editor) => {
            monaco.editor.setModelLanguage(editor.getModel(), "scss");
        }
    })
    editor.addAction({
        id: "7_powershell",
        label: "Set to Powershell",
        contextMenuGroupId: "3_lang",
        run: (editor) => {
            monaco.editor.setModelLanguage(editor.getModel(), "powershell");
        }
    })
    editor.addAction({
        id: "7_plain",
        label: "Set to Plain text",
        contextMenuGroupId: "3_lang",
        run: (editor) => {
            monaco.editor.setModelLanguage(editor.getModel(), "plain");
        }
    })

    editor.focus();
    versionid = editor.getModel().getAlternativeVersionId();
});


