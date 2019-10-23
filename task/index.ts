import tl = require('vsts-task-lib/task');
import trm = require('vsts-task-lib/toolrunner');
import path = require('path');
import fs = require('fs');
import iconv = require('iconv-lite');
import { escape } from 'querystring';

const ENCODING_AUTO: string = 'auto';
const ENCODING_ASCII: string = 'ascii';
const ENCODING_UTF_7: string = 'utf-7';
const ENCODING_UTF_8: string = 'utf-8';
const ENCODING_UTF_16LE: string = 'utf-16le';
const ENCODING_UTF_16BE: string = 'utf-16be';

const ACTION_WARN: string = 'warn';
const ACTION_FAIL: string = 'fail';

var mapEncoding = function (encoding: string): string {
    switch (encoding)
    {
        case 'auto':
            return ENCODING_AUTO;

        case 'Ascii':
        case 'ascii':
            return ENCODING_ASCII;

        case 'UTF7':
        case 'utf-7':
            return ENCODING_UTF_7;

        case 'UTF8':
        case 'utf-8':
            return ENCODING_UTF_8;

        case 'Unicode':
        case 'utf-16le':
            return ENCODING_UTF_16LE;

        case 'BigEndianUnicode':
        case 'utf-16be':
            return ENCODING_UTF_16BE;

        case 'UTF32':
            throw new Error('utf-32 encoding is no more supported.');

        case 'BigEndianUTF32':
            throw new Error('utf-32be encoding is no more supported.');

        default:
            throw new Error('invalid encoding: ' + encoding);
    }
}

var getEncoding = function (filePath: string): string {
    let fd: number = fs.openSync(filePath, 'r');

    try
    {
        let bytes: Buffer = new Buffer(4);
        fs.readSync(fd, bytes, 0, 4, 0);

        let encoding: string = ENCODING_ASCII;
        if (bytes[0] === 0x2b && bytes[1] === 0x2f && bytes[2] === 0x76 && (bytes[3] === 0x38 || bytes[3] === 0x39 || bytes[3] === 0x2b || bytes[3] === 0x2f))
            encoding = ENCODING_UTF_7;
        else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
            encoding = ENCODING_UTF_8
        else if (bytes[0] === 0xfe && bytes[1] === 0xff)
            encoding = ENCODING_UTF_16BE
        else if (bytes[0] === 0xff && bytes[1] === 0xfe)
            encoding = ENCODING_UTF_16LE
        else
            tl.debug('BOM no found: default to ascii.');

        tl.debug('encoding: ' + encoding);

        return encoding;
    }
    finally
    {
        fs.closeSync(fd);
    }
}

var replaceTokensInFile = function (filePath: string, encoding: string, writeBOM: boolean): void {
    tl.debug('replacing variables in: ' + filePath);

    // ensure encoding
    if (encoding === ENCODING_AUTO)
        encoding = getEncoding(filePath);

    let tokenPrefix: string = tl.getInput('tokenPrefix', true);
    let tokenSuffix: string = tl.getInput('tokenSuffix', true);

    const v = tl.getVariables();

    // read file and replace tokens
    let content: string = iconv.decode(fs.readFileSync(filePath), encoding);

    v.forEach(e => {
        let name = replaceRegExp(e.name);
        tl.debug('Variable name: ' + name);

        //skips if the name contains our variable to be replaced.
        if(name.indexOf(tokenPrefix) <= -1){
            let loopVar : boolean = e.value.indexOf(tokenPrefix) > -1;
            while(loopVar) {
                tl.debug('Found nested variable, attempting to replace: ' + e.value)
                e.value = replaceInnerTokens(e.value, tokenPrefix, tokenSuffix);
                loopVar = e.value.indexOf(tokenPrefix) > -1;
            }

            let masterRegExps = 
                [new RegExp('(?:"' + name + '")[^>]*?(?:value="|connectionString=")(.*?)"','gm'),
                 new RegExp('(?:name="' + name + '").*?>\\s*<value>([\\S\\s]*?)<\/value>', 'gm')];

            masterRegExps.forEach(masterRegEx => {
                content = content.replace(masterRegEx, (match, caption) => {
                    tl.debug('match: ' + match + ' with caption: ' + caption + ' will be replace with: ' + e.value);
                    
                    let val = match.replace(caption == '' ? '""' : caption, caption == '' ? '"'+ e.value +'"' :  e.value);
                    tl.debug('variable replaced: ' + val);
                    return val;
                });
            })
        }
    });

    // write file
    fs.writeFileSync(filePath, iconv.encode(content, encoding, { addBOM: writeBOM, stripBOM: null, defaultEncoding: null }));
}

var replaceInnerTokens = function(value: string, tokenPrefix: string, tokenSuffix:string ): string {
    tokenPrefix = tokenPrefix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    tokenSuffix = tokenSuffix.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');

    let regex: RegExp = new RegExp(tokenPrefix + '((?:(?!' + tokenSuffix + ').)*)' + tokenSuffix, 'gm');
    let variableName = value.match(regex);
    let newvalue = tl.getVariable(variableName[0]);
    var tmpContent = value.replace(regex, newvalue);

    return tmpContent;
}

var replaceRegExp = function(str: string){
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

async function run() {
    try {
        // load inputs
        let root: string = tl.getPathInput('rootDirectory', false, true);
        let encoding: string = mapEncoding(tl.getInput('encoding', true));
        let writeBOM: boolean = tl.getBoolInput('writeBOM', true);

        let targetFiles: string[] = [];
        tl.getDelimitedInput('targetFiles', '\n', true).forEach((x: string) => {
            if (x)
                x.split(',').forEach((y: string) => {
                    if (y)
                        targetFiles.push(y.trim());
                })
        });

        // process files
        tl.findMatch(root, targetFiles).forEach(filePath => {
            if (!tl.exist(filePath))
            {
                tl.error('file not found: ' + filePath);
                return;
            }

            replaceTokensInFile(filePath, encoding, writeBOM);
        });
    }
    catch (err)
    {
        tl.setResult(tl.TaskResult.Failed, err.message);
    }
}

run();
