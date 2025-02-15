import { Categorized, Location, instanceOfLocation } from '../models/categorized-location';
import { CategoryItems } from '../models/internal-models';
import { StringUtils } from './';

export class DataUtils {
    public static replaceVariables(input: string, variables: Location): string {
        let output = input;
        for (let [varName, varValue] of Object.entries(variables)) {
            output = output.replaceAll(`{{${varName}}}`, varValue);
        }
        return output;
    }

    public static replaceVariablesInObj(jsonValue: any, variables: Categorized | Location): any {
        switch (typeof jsonValue) {
            case 'object': {
                for (let key in jsonValue) {
                    // "for ... in" loops over all properties, including prototypes
                    // So we need to check if this property belong to only the object
                    if (!jsonValue.hasOwnProperty(key)) {
                        continue;
                    }
                    jsonValue[key] = this.replaceVariablesInObj(jsonValue[key], variables);
                }
                break;
            }
            case 'string': {
                if (instanceOfLocation(variables)) {
                    jsonValue = this.replaceVariables(jsonValue, variables);
                } else {
                    jsonValue = this.replaceVariablesInObj(jsonValue, variables);
                }
                break;
            }
            default: {
                break;
            }
        }

        return jsonValue;
    }

    public static flatten<T>(input: CategoryItems<T>): { [refName: string]: T } {
        let output: { [refName: string]: any } = {};
        for (let [categoryName, categoryData] of Object.entries(input)) {
            for (let [itemName, itemData] of Object.entries(categoryData)) {
                output[`${categoryName}.${itemName}`] = itemData;
            }
        }
        return output;
    }

    public static flattenToVariables(
        input: CategoryItems<string | string[]>,
        prefix?: string
    ): { [refName: string]: string } {
        let output: { [refName: string]: any } = {};
        for (let [categoryName, categoryData] of Object.entries(input)) {
            for (let [itemName, itemData] of Object.entries(categoryData)) {
                output[`${prefix}${categoryName}.${itemName}`] = StringUtils.join(itemData, '\n');
            }
        }
        return output;
    }
}
