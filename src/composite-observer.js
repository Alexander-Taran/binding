const conditionAlways = primary => true;
const childChangedContext = 'childChanged';

export class CompositeObserver {
  constructor(expression, scope, binding) {
    this.expression = expression;
    this.scope = scope;
    this.binding = binding;
    this.value = this.expression.evaluate(this.scope, this.binding.valueConverterLookupFunction);
  }

  getValue() {
    return this.value;
  }

  subscribe(context, callable) {
    this.context = context;
    this.callable = callable;
    this.connect(true);
  }

  unsubscribe(context, callable) {
    this.context = null;
    this.callable = null;
    this.connect(false);
  }

  addPrimary(expression) {
    this.primary = this.addChild(expression);
    this.primaryValue = this.primary.value;
  }

  addChild(expression, condition) {
    condition = condition || conditionAlways;
    let info;
    if (condition(this.primaryValue)) {
      info = expression.connect(this.binding, this.scope);
      if (!info.observer) {
        // the expression is not observable
        return info;
      }
    }
    let child = {
      expression: expression,
      condition: condition,
      info: info,
      subscribed: false
    };
    this.children = this.children || (this.children = []); // lazily create childen array.
    this.children.push(child);
    return info;
  }

  get isObservable() {
    return !!this.children;
  }

  call(context) {
    // notify
    let oldValue = this.value;
    let newValue = this.expression.evaluate(this.scope, this.binding.valueConverterLookupFunction);
    this.value = newValue;
    if (this.context) {
      this.callable.call(this.context, newValue, oldValue);
    } else {
      this.context(newValue, oldValue);
    }
    // synchronize observers
    this.connect(true);
  }

  connect(connect) {
    let length = this.children.length;
    let primary = this.primary;
    let primaryValue = undefined;
    if (primary) {
      primaryValue = primary.observer ? primary.observer.getValue() : primary.value;
    }
    for (let i = 0; i < length; i++) {
      let child = this.children[i];
      let conditionMet = child.condition(primaryValue);

      if (connect && conditionMet) {
        // connect + subscribe
        if (!child.info) {
          child.info = child.expression.connect(this.binding, this.scope);
        }
        if (!child.subscribed && child.info.observer) {
          child.info.observer.subscribe(childChangedContext, this);
          child.subscribed = true;
        }
        continue;
      }

      // unsubscribe
      if (!child.subscribed) {
        continue;
      }
      child.info.observer.unsubscribe(childChangedContext, this);
    }
  }
}

// ValueConverter
// - Args
//
// Conditional
// - Condition
// - Yes
// - No
// - should not connect Yes if Condition is falsey
// - should not connect No if Condition is truthy
//
// CallScope
// - Name
// - Args
// - should not connect args if name is null/Undefined/not a function
//
// CallMember
// - Instance
// - Args
// - should not connect args if instance is null/Undefined/not a function
//
// CallFunction
// - Func
// - Args
// - should not connect args if instance is null/Undefined/not a function
//
// Binary
// - Left
// - Right
// - should not connect Right if operator is && and Left is falsey
// - should not connect Right if operator is || and Left is truthy
//
// PrefixNot
// - expression
