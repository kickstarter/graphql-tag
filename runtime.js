// Collect any fragment/type references from a node, adding them to the refs Set
function collectFragmentReferences(node, refs) {
  if (node.kind === "FragmentSpread") {
    refs.add(node.name.value);
  } else if (node.kind === "VariableDefinition") {
    var type = node.type;
    if (type.kind === "NamedType") {
      refs.add(type.name.value);
    }
  }

  if (node.selectionSet) {
    node.selectionSet.selections.forEach(function(selection) {
      collectFragmentReferences(selection, refs);
    });
  }

  if (node.variableDefinitions) {
    node.variableDefinitions.forEach(function(def) {
      collectFragmentReferences(def, refs);
    });
  }

  if (node.definitions) {
    node.definitions.forEach(function(def) {
      collectFragmentReferences(def, refs);
    });
  }
}

function findOperation(document, name) {
  for (var i = 0; i < document.definitions.length; i++) {
    var element = document.definitions[i];
    if (element.name && element.name.value == name) {
      return element;
    }
  }
}

exports.extractReferences = function extractReferences(document) {
  const definitionRefs = {};

  document.definitions.forEach(function(def) {
    if (def.name) {
      var refs = new Set();
      collectFragmentReferences(def, refs);
      definitionRefs[def.name.value] = refs;
    }
  });

  return definitionRefs;
};

exports.oneQuery = function oneQuery(document, operationName, definitionRefs) {
  // Copy the DocumentNode, but clear out the definitions
  var newDoc = {
    kind: document.kind,
    definitions: [findOperation(document, operationName)]
  };
  if (document.hasOwnProperty("loc")) {
    newDoc.loc = document.loc;
  }

  // Now, for the operation we're running, find any fragments referenced by
  // it or the fragments it references
  var opRefs = definitionRefs[operationName] || new Set();
  var allRefs = new Set();
  var newRefs = new Set();

  // IE 11 doesn't support "new Set(iterable)", so we add the members of opRefs to newRefs one by one
  opRefs.forEach(function(refName) {
    newRefs.add(refName);
  });

  while (newRefs.size > 0) {
    var prevRefs = newRefs;
    newRefs = new Set();

    prevRefs.forEach(function(refName) {
      if (!allRefs.has(refName)) {
        allRefs.add(refName);
        var childRefs = definitionRefs[refName] || new Set();
        childRefs.forEach(function(childRef) {
          newRefs.add(childRef);
        });
      }
    });
  }

  allRefs.forEach(function(refName) {
    var op = findOperation(document, refName);
    if (op) {
      newDoc.definitions.push(op);
    }
  });

  return newDoc;
};
