export class SetterObserver {
  constructor(taskQueue, obj, propertyName){
    this.taskQueue = taskQueue;
    this.obj = obj;
    this.propertyName = propertyName;
    this.callbacks = [];
    this.queued = false;
    this.observing = false;
  }

  getValue(){
    return this.obj[this.propertyName];
  }

  setValue(newValue){
    this.obj[this.propertyName] = newValue;
  }

  getterValue(){
    return this.currentValue;
  }

  setterValue(newValue){
    var oldValue = this.currentValue;

    if(oldValue != newValue){
      if(!this.queued){
        this.oldValue = oldValue;
        this.queued = true;
        this.taskQueue.queueMicroTask(this);
      }

      this.currentValue = newValue;
    }
  }

  call(){
    var callbacks = this.callbacks,
        i = callbacks.length,
        oldValue = this.oldValue,
        newValue = this.currentValue;

    this.queued = false;

    while(i--) {
      callbacks[i](newValue, oldValue);
    }
  }

  subscribe(callback){
    var callbacks = this.callbacks;
    callbacks.push(callback);

    if(!this.observing){
      this.convertProperty();
    }

    return function(){
      callbacks.splice(callbacks.indexOf(callback), 1);
    };
  }

  convertProperty(){
    this.observing = true;
    this.currentValue = this.obj[this.propertyName];
    this.setValue = this.setterValue;
    this.getValue = this.getterValue;

    try{
      Object.defineProperty(this.obj, this.propertyName, {
        configurable: true,
        enumerable: true,
        get: this.getValue.bind(this),
        set: this.setValue.bind(this)
      });
    }catch(_){}
  }
}

export class OoObjectObserver {
  constructor(obj, observerLocator){
    this.obj = obj;
    this.observers = {};
    this.observerLocator = observerLocator;
  }

  subscribe(propertyObserver, callback){
    var callbacks = propertyObserver.callbacks;
    callbacks.push(callback);

    if(!this.observing){
      this.observing = true;
      try{
        Object.observe(this.obj, changes => this.handleChanges(changes), ['update', 'add']);
      }catch(_){}
    }

    return function(){
      callbacks.splice(callbacks.indexOf(callback), 1);
    };
  }

  getObserver(propertyName, descriptor){
    var propertyObserver = this.observers[propertyName];
    if (!propertyObserver) {
      if (descriptor) {
        propertyObserver = this.observers[propertyName] = new OoPropertyObserver(this, this.obj, propertyName);
      } else {
        propertyObserver = this.observers[propertyName] = new UndefinedPropertyObserver(this, this.obj, propertyName);
      }
    }
    return propertyObserver;
  }

  handleChanges(changeRecords){
    var updates = {},
        observers = this.observers,
        i = changeRecords.length;

    while(i--) {
      var change = changeRecords[i],
          name = change.name;

      if(!(name in updates)){
        var observer = observers[name];
        updates[name] = true;
        if(observer){
          observer.trigger(change.object[name], change.oldValue);
        }
      }
    }
  }
}

export class OoPropertyObserver {
  constructor(owner, obj, propertyName){
    this.owner = owner;
    this.obj = obj;
    this.propertyName = propertyName;
    this.callbacks = [];
  }

  getValue(){
    return this.obj[this.propertyName];
  }

  setValue(newValue){
    this.obj[this.propertyName] = newValue;
  }

  trigger(newValue, oldValue){
    var callbacks = this.callbacks,
        i = callbacks.length;

    while(i--) {
      callbacks[i](newValue, oldValue);
    }
  }

  subscribe(callback){
    return this.owner.subscribe(this, callback);
  }
}

export class UndefinedPropertyObserver {
  constructor(owner, obj, propertyName){
    this.owner = owner;
    this.obj = obj;
    this.propertyName = propertyName;
    this.callbackMap = new Map();
    this.callbacks = []; // unused here, but required by owner OoObjectObserver.
  }

  getValue(){
    // delegate this to the actual observer if possible.
    if (this.actual){
      return this.actual.getValue();
    }
    return this.obj[this.propertyName];
  }

  setValue(newValue){
    // delegate this to the actual observer if possible.
    if (this.actual){
      this.actual.setValue(newValue);
      return;
    }
    // define the property and trigger the callbacks.
    this.obj[this.propertyName] = newValue;
    this.trigger(newValue, undefined);
  }

  trigger(newValue, oldValue){
    var callback;

    // we only care about this event one time:  when the property becomes defined.
    if (this.subscription){
      this.subscription();
    }

    // get the actual observer.
    this.getObserver();

    // invoke the callbacks.
    for(callback of this.callbackMap.keys()) {
      callback(newValue, oldValue);
    }
  }

  getObserver() {
    var callback, observerLocator;

    // has the property has been defined?
    if (!Object.getOwnPropertyDescriptor(this.obj, this.propertyName)) {
      return;
    }

    // get the actual observer.
    observerLocator = this.owner.observerLocator;
    delete this.owner.observers[this.propertyName];
    delete observerLocator.getObserversLookup(this.obj, observerLocator)[this.propertyName];
    this.actual = observerLocator.getObserver(this.obj, this.propertyName);

    // attach any existing callbacks to the actual observer.
    for(callback of this.callbackMap.keys()) {
      this.callbackMap.set(callback, this.actual.subscribe(callback));
    }
  }

  subscribe(callback){
    // attempt to get the actual observer in case the property has become
    // defined since the ObserverLocator returned [this].
    if (!this.actual) {
      this.getObserver();
    }

    // if we have the actual observer, use it.
    if (this.actual){
      return this.actual.subscribe(callback);
    }

    // start listening for the property to become defined.
    if (!this.subscription){
      this.subscription = this.owner.subscribe(this);
    }

    // cache the callback.
    this.callbackMap.set(callback, null);

    // return the method to dispose the subscription.
    return () => {
      var actualDispose = this.callbackMap.get(callback);
      if (actualDispose)
        actualDispose();
      this.callbackMap.delete(callback);
    };
  }
}

export class ElementObserver {
  constructor(element, propertyName, handler){
    var xlinkResult = /^xlink:(.+)$/.exec(propertyName);

    this.element = element;
    this.propertyName = propertyName;
    this.handler = handler;
    this.callbacks = [];

    if (xlinkResult) {
      // xlink namespaced attributes require getAttributeNS/setAttributeNS
      // (even though the NS version doesn't work for other namespaces
      // in html5 documents)
      propertyName = xlinkResult[1];
      this.getValue = () => element.getAttributeNS('http://www.w3.org/1999/xlink', propertyName);
      this.setValue = newValue => element.setAttributeNS('http://www.w3.org/1999/xlink', propertyName, newValue);
    } else if (/^\w+:|^data-|^aria-/.test(propertyName) || element instanceof SVGElement) {
      // namespaced attributes, data-* attributes, aria-* attributes and any native SVGElement attribute require getAttribute/setAttribute
      this.getValue = () => element.getAttribute(propertyName);
      this.setValue = newValue => element.setAttribute(propertyName, newValue);
    } else if (propertyName === 'style' || propertyName === 'css') {
      // style and css attributes map to element.style.cssText with special handling for object values.
      this.getValue = () => element.style.cssText;
      this.setValue = newValue => {
        if (newValue instanceof Object) {
          newValue = flattenCss(newValue);
        }
        element.style.cssText = newValue;
      };
    } else {
      // everything else uses standard property accessor/assignment.
      this.getValue = () => element[propertyName];
      this.setValue = newValue => {
        element[propertyName] = newValue;
        if (handler) {
          this.call();
        }
      }
    }

    this.oldValue = this.getValue();
  }

  call(){
    var callbacks = this.callbacks,
        i = callbacks.length,
        oldValue = this.oldValue,
        newValue = this.getValue();

    while(i--) {
      callbacks[i](newValue, oldValue);
    }

    this.oldValue = newValue;
  }

  subscribe(callback){
    var that = this;

    if (!this.handler) {
      // todo: consider adding logic to use DirtyChecking for "native" Element
      // properties and O.o/SetterObserver/etc for "ad-hoc" Element properties.
      throw new Error('Observation of an Element\'s "' + this.propertyName + '" property is not supported.');
    }

    if(!this.disposeHandler){
      this.disposeHandler = this.handler
        .subscribe(this.element, this.call.bind(this));
    }

    var callbacks = this.callbacks;

    callbacks.push(callback);

    return function(){
      callbacks.splice(callbacks.indexOf(callback), 1);
      if(callbacks.length === 0){
        that.disposeHandler();
        that.disposeHandler = null;
      }
    };
  }
}

function flattenCss(object) {
  var s = '';
  for(var propertyName in object) {
    if (object.hasOwnProperty(propertyName)){
      s += propertyName + ': ' + object[propertyName] + '; ';
    }
  }
  return s;
}

export class SelectValueObserver {
  constructor(element, handler, observerLocator){
    this.element = element;
    this.handler = handler;
    this.observerLocator = observerLocator;
  }

  getValue() {
    return this.value;
  }

  setValue(newValue) {
    if (newValue !== null && newValue !== undefined && this.element.multiple && !Array.isArray(newValue)) {
      throw new Error('Only null or Array instances can be bound to a multi-select.')
    }
    if (this.value === newValue) {
      return;
    }
    // unsubscribe from old array.
    if (this.arraySubscription) {
      this.arraySubscription();
      this.arraySubscription = null;
    }
    // subscribe to new array.
    if (Array.isArray(newValue)) {
      this.arraySubscription = this.observerLocator.getArrayObserver(newValue)
        .subscribe(this.synchronizeOptions.bind(this));
    }
    // assign and sync element.
    this.value = newValue;
    this.synchronizeOptions();
  }

  synchronizeOptions() {
    var value = this.value, i, options, option, optionValue, clear, isArray;

    if (value === null || value === undefined) {
      clear = true;
    } else if (Array.isArray(value)) {
      isArray = true;
    }

    options = this.element.options;
    i = options.length;
    while(i--) {
      option = options.item(i);
      if (clear) {
        option.selected = false;
        continue;
      }
      optionValue = option.hasOwnProperty('model') ? option.model : option.value;
      if (isArray) {
        option.selected = value.indexOf(optionValue) !== -1;
        continue;
      }
      option.selected = value === optionValue;
    }
  }

  synchronizeValue(){
    var selectedOptions = this.element.selectedOptions,
        count = selectedOptions.length,
        option, i, value;

    if (this.element.multiple) {
      value = [];
      for(i = 0; i < count; i++) {
        option = selectedOptions.item(i);
        value[i] = option.hasOwnProperty('model') ? option.model : option.value;
      }
    } else if (count === 0) {
      value = null;
    } else {
      option = selectedOptions.item(0);
      value = option.hasOwnProperty('model') ? option.model : option.value;
    }

    this.oldValue = this.value;
    this.value = value;
    this.call();
  }

  call(){
    var callbacks = this.callbacks,
        i = callbacks.length,
        oldValue = this.oldValue,
        newValue = this.value;

    while(i--) {
      callbacks[i](newValue, oldValue);
    }
  }

  subscribe(callback) {
    if(!this.callbacks) {
      this.callbacks = [];
      this.disposeHandler = this.handler
        .subscribe(this.element, this.synchronizeValue.bind(this, false));
    }

    this.callbacks.push(callback);
    return this.unsubscribe.bind(this, callback);
  }

  unsubscribe(callback) {
    var callbacks = this.callbacks;
    callbacks.splice(callbacks.indexOf(callback), 1);
    if(callbacks.length === 0){
      this.disposeHandler();
      this.disposeHandler = null;
      this.callbacks = null;
    }
  }

  bind() {
    this.domObserver = new MutationObserver(this.synchronizeOptions.bind(this));
    this.domObserver.observe(this.element, { childList: true, subtree: true });
  }

  unbind() {
    this.domObserver.disconnect();
    this.domObserver = null;

    if (this.arraySubscription) {
      this.arraySubscription();
      this.arraySubscription = null;
    }
  }
}

// polyfill HTMLSelectElement.selectedOptions
class SelectedOptions {
  constructor(element) {
    var options = element.options, option, selected = [], i, ii;
    for (i = 0, ii = options.length; i < ii; i++) {
      option = options[i];
      if (option.selected) {
        selected.push(option);
      }
    }
    this.selected = selected;
    this.length = selected.length;
  }

  item(i) {
    return this.selected[i];
  }
}

if (!HTMLSelectElement.prototype.selectedOptions) {
  Object.defineProperty(
    HTMLSelectElement.prototype,
    'selectedOptions',
    {
      get: function() {
        return new SelectedOptions(this);
      }
    });
}
