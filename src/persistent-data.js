import {VERSION, defineSymbol} from './symbols';
import {Util} from './util';

const dataMap = new WeakMap();
const serializedDataMap = new WeakMap(); // TODO refer per property

function getData(obj) {
  if (!dataMap.has(obj)) {
    dataMap.set(obj, {});
  }
  return dataMap.get(obj);
}

function keyToObject(key) {
  let keyObj = {};
  key.split(/\s*,\s*/).forEach(tuple => {
    let [p, v] = tuple.split(/\s*=\s*/);
    keyObj[p] = v;
  });
  return keyObj;
}

function getObjectFromArray(baseObj, path, allowCreation) {
  let keys = path.match(/\[[^\]]+\]/g).map(k => k.substring(1, k.length - 1));
  let prop = path.substring(0, path.indexOf('['));
  if (!(prop in baseObj)) {
    if (!allowCreation) {
      return undefined;
    }
    baseObj[prop] = [];
  }
  let obj = baseObj[prop];
  if (!Array.isArray(obj)) {
    return undefined;
  }
  for (let key of keys) {
    let lastKey = keys.indexOf(key) === keys.length - 1;
    if (Util.isInt(key)) {
      if (!(key in obj)) {
        if (!allowCreation) {
          obj = undefined;
          break;
        }
        obj[key] = lastKey ? {} : [];
      }
      obj = obj[key];
    } else {
      if (!lastKey) {
        // smart array index must refer to an object
        throw Error(`invalid array index: ${path}`);
      }
      let keyObj = keyToObject(key);
      obj = obj.find(o => {
        for (let p in keyObj) {
          if (o[p] !== keyObj[p]) {
            return false;
          }
        }
        return true;
      });
      if (!obj && allowCreation) {
        obj = keyObj;
      }
    }
  }
  return obj;
}

export function readValue(baseObj, fullPath) {
  let obj = baseObj;
  for (let prop of fullPath.split('.')) {
    if (prop.charAt(prop.length - 1) === ']') {
      obj = getObjectFromArray(obj, prop);
    } else {
      obj = obj[prop];
    }
    if (typeof obj !== 'object' || obj === null) {
      break;
    }
  }
  return obj;
}

function writeValue(baseObj, fullPath, value) {
  let obj = baseObj;
  let props = fullPath.split('.');
  let lastProp = props.pop();
  for (let prop of props) {
    if (prop.charAt(prop.length - 1) === ']') {
      obj = getObjectFromArray(obj, prop, true);
    } else {
      if (!(prop in obj)) {
        obj[prop] = {};
      }
      obj = obj[prop];
    }
  }
  let update = obj ? obj[lastProp] !== value : false;
  if (update) {
    obj[lastProp] = value;
  }
  return update;
}

function serialize(data) {
  return JSON.stringify(data || {});
}

export class PersistentData {
  static getProperty(obj, path) {
    let data = getData(obj);
    return readValue(data, path);
  }

  static setProperty(obj, path, value) {
    let data = getData(obj);
    if (writeValue(data, path, value)) {
      obj[VERSION]++;
    }
  }

  static extract(obj) {
    return dataMap.has(obj) ? dataMap.get(obj) : null;
  }

  static inject(obj, data) {
    if (!Util.isObject(data)) {
      throw new TypeError('injection data must be an object');
    }
    if (!Reflect.has(obj, VERSION)) {
      defineSymbol(obj, VERSION, 0);
    }
    dataMap.set(obj, data);
    serializedDataMap.set(obj, serialize(data));
    obj[VERSION]++;
  }

  static isDirty(obj) {
    return serializedDataMap.get(obj) !==
        serialize(PersistentData.extract(obj));
  }
}

