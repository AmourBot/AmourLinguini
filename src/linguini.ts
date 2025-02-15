import path from 'path';
import { Categorized } from './models/categorized-location';
import { LinguiniError } from './models/error-models';
import { CommonFile, LangFile, TypeMapper } from './models/internal-models';
import { DataUtils, FileUtils, RegexUtils } from './utils/';

type LinguiniOptions = {
    /**
     * Number of levels variables should be replaced.
     * @defaultValue `10`
     */
    replacementLevels: number;
    /**
     * Full path to a custom common language file.
     */
    customCommonFile?: string;
};

export class Linguini {
    private options: LinguiniOptions = {
        replacementLevels: 10,
        customCommonFile: undefined,
    };
    private comData: { [location: string]: string } = {};
    private langDatas: {
        [langCode: string]: {
            data: { [location: string]: any };
            refs: { [location: string]: string };
        };
    } = {};

    /**
     * Creates a new Linguini object to manage language files.
     *
     * @param folderPath - The folder path containing the language files.
     * @param fileName - The base name of the language files to use. Note this should not include any file extensions or language codes. Ex: `lang`.
     * @param options - Options to use for this Linguini setup.
     *
     * @returns A new Linguini object.
     */
    constructor(folderPath: string, fileName: string, options: Partial<LinguiniOptions> = {}) {
        this.options = Object.assign(this.options, options);

        // Validate options
        if (this.options.customCommonFile && !FileUtils.exists(this.options.customCommonFile)) {
            throw new LinguiniError(
                `Custom common file does not exist: ${this.options.customCommonFile}`
            );
        }

        // Locate common file
        let comFilePath =
            this.options.customCommonFile ?? path.join(folderPath, `${fileName}.common.json`);

        let comVars: { [refName: string]: string } = {};
        if (FileUtils.exists(comFilePath)) {
            // Read common file
            let comFileContents = FileUtils.readFileSync(comFilePath);
            let comFile = JSON.parse(comFileContents) as CommonFile;

            // Extract common variables
            comVars = DataUtils.flattenToVariables(comFile, 'COM:');
            for (let i = 0; i < this.options.replacementLevels; i++) {
                comVars = DataUtils.replaceVariablesInObj(comVars, comVars);
            }
            this.comData = comVars;
        }

        let fileNames = FileUtils.readFileNamesSync(folderPath);
        let langCodes = RegexUtils.getLangCodes(fileName, fileNames);

        for (let langCode of langCodes) {
            // Locate lang file
            let langFileName = `${fileName}.${langCode}.json`;
            let langFilePath = path.join(folderPath, langFileName);

            // Read lang file
            let langFileContents = FileUtils.readFileSync(langFilePath);
            let langFile = JSON.parse(langFileContents) as LangFile;

            // Extract ref variables
            let refVars = DataUtils.flattenToVariables(langFile.refs, 'REF:');
            refVars = DataUtils.replaceVariablesInObj(refVars, comVars);
            for (let i = 0; i < this.options.replacementLevels; i++) {
                refVars = DataUtils.replaceVariablesInObj(refVars, refVars);
            }

            // Replace variables in lang data
            let langData = DataUtils.replaceVariablesInObj(langFile.data, comVars);
            langData = DataUtils.replaceVariablesInObj(langFile.data, refVars);

            // Store lang data
            this.langDatas[langCode] = {
                data: DataUtils.flatten(langData),
                refs: refVars,
            };
        }
    }

    /**
     * Returns an item from a language file, mapped to a type.
     *
     * @param location - The location of the item in the language file, using dot-notation, and relative to the "data" section in the JSON. Ex: `myCategory.myItem`.
     * @param langCode - The language file code to extract from. Ex: `en`.
     * @param typeMapper - A function which maps the retrieved item data to a type. The could be a built-in function from Linguini's `TypeMappers`  import, or a custom function.
     * @param variables - Any variables (Ex: `{{MY_VARIABLE}}`) to replace in the retrieved data.
     *
     * @returns The retrieved language file item.
     */
    public get<T>(
        location: string,
        langCode: string,
        typeMapper: TypeMapper<T>,
        variables?: Categorized
    ): T {
        let raw = this.getRaw(location, langCode, variables);
        return typeMapper(raw);
    }

    /**
     * Returns an item from a language file, as raw JSON.
     *
     * @param location - The location of the item in the language file, using dot-notation, and relative to the "data" section in the JSON. Ex: `myCategory.myItem`.
     * @param langCode - The language file code to extract from. Ex: `en`.
     * @param variables - Any variables (Ex: `{{MY_VARIABLE}}`) to replace in the retrieved data.
     *
     * @returns The retrieved language file item.
     */
    public getRaw(location: string, langCode: string, variables?: Categorized): any {
        let langData = this.langDatas[langCode];
        if (langData === undefined) {
            throw new LinguiniError(`Invalid language code: ${langCode}`);
        }

        let jsonValue = langData.data[location];
        if (jsonValue === undefined) {
            throw new LinguiniError(`Invalid location: ${location}`);
        }

        jsonValue = JSON.parse(JSON.stringify(jsonValue));
        if (variables) {
            jsonValue = DataUtils.replaceVariablesInObj(jsonValue, variables);
        }
        return jsonValue;
    }

    /**
     * Returns a reference string from a language file.
     *
     * @param location - The location of the reference in the language file, using dot-notation, and relative to the "refs" section in the JSON. Ex: `myCategory.myItem`.
     * @param langCode - The language file code to extract from. Ex: `en`.
     * @param variables - Any variables (Ex: `{{MY_VARIABLE}}`) to replace in the retrieved data.
     *
     * @returns The retrieved language file reference string.
     */
    public getRef(
        location: string,
        langCode: string,
        variables?: { [name: string]: string }
    ): string {
        let langData = this.langDatas[langCode];
        if (langData === undefined) {
            throw new LinguiniError(`Invalid language code: ${langCode}`);
        }

        let ref = langData.refs[`REF:${location}`];
        if (ref === undefined) {
            throw new LinguiniError(`Invalid location: ${location}`);
        }

        if (variables) {
            ref = DataUtils.replaceVariablesInObj(ref, variables);
        }
        return ref;
    }

    /**
     * Returns a common reference string from the common language file (*.common.json).
     *
     * @param location - The location of the reference in the common language file, using dot-notation. Ex: `myCategory.myItem`.
     * @param variables - Any variables (Ex: `{{MY_VARIABLE}}`) to replace in the retrieved data.
     *
     * @returns The retrieved common reference string.
     */
    public getCom(location: string, variables?: { [name: string]: string }): string {
        let com = this.comData[`COM:${location}`];
        if (com === undefined) {
            throw new LinguiniError(`Invalid location: ${location}`);
        }

        if (variables) {
            com = DataUtils.replaceVariablesInObj(com, variables);
        }
        return com;
    }
}
