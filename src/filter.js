import {ResourceType} from 'aurelia-metadata';

var capitalMatcher = /([A-Z])/g;

function addHyphenAndLower(char){
  return "-" + char.toLowerCase();
}

function hyphenate(name){
  return (name.charAt(0).toLowerCase() + name.slice(1)).replace(capitalMatcher, addHyphenAndLower);
}

export class Filter extends ResourceType {
  constructor(name){
    this.name = name;
  }

  static convention(name){
    if(name.endsWith('ValueConverter')){
      return new Filter(hyphenate(name.substring(0, name.length-14)));
    }
  }

  register(registry, name){
  	registry.registerFilter(name || this.name, target);
  }
}