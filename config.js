System.config({
  "paths": {
    "*": "*.js",
    "github:*": "jspm_packages/github/*.js",
    "aurelia-binding/*": "dist/*.js",
    "npm:*": "jspm_packages/npm/*.js"
  }
});

System.config({
  "map": {
    "aurelia-dependency-injection": "github:aurelia/dependency-injection@0.4.4",
    "aurelia-metadata": "github:aurelia/metadata@0.3.2",
    "aurelia-task-queue": "github:aurelia/task-queue@0.2.4",
    "github:aurelia/dependency-injection@0.4.4": {
      "aurelia-metadata": "github:aurelia/metadata@0.3.2",
      "core-js": "npm:core-js@0.4.10"
    },
    "github:jspm/nodelibs-process@0.1.1": {
      "process": "npm:process@0.10.0"
    },
    "npm:core-js@0.4.10": {
      "process": "github:jspm/nodelibs-process@0.1.1"
    }
  }
});

