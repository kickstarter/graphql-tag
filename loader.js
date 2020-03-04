"use strict";

const jsesc = require("jsesc");
const os = require("os");
const gql = require("./src");

// Takes `source` (the source GraphQL query string)
// and `doc` (the parsed GraphQL document) and tacks on
// the imported definitions.
function expandImports(source, doc) {
  const lines = source.split(/\r\n|\r|\n/);
  let outputCode = `
    var names = {};
    function unique(defs) {
      return defs.filter(
        function(def) {
          if (def.kind !== 'FragmentDefinition') return true;
          var name = def.name.value
          if (names[name]) {
            return false;
          } else {
            names[name] = true;
            return true;
          }
        }
      )
    }
  `;

  lines.some(line => {
    if (line[0] === "#" && line.slice(1).split(" ")[0] === "import") {
      const importFile = line.slice(1).split(" ")[1];
      const parseDocument = `require(${importFile})`;
      const appendDef = `doc.definitions = doc.definitions.concat(unique(${parseDocument}.definitions));`;
      outputCode += appendDef + os.EOL;
    }
    return line.length !== 0 && line[0] !== "#";
  });

  return outputCode;
}

module.exports = function(source) {
  const runtimePath = this.runtimePath || "graphql-tag/runtime";
  this.cacheable();
  const doc = gql`
    ${source}
  `;
  let headerCode = `
    var doc = JSON.parse(${jsesc(JSON.stringify(doc), {
      json: true,
      isScriptContext: true
    })});
    doc.loc.source = ${JSON.stringify(doc.loc.source)};
  `;

  let outputCode = `
    module.exports = doc;
  `;

  // Allow multiple query/mutation definitions in a file. This parses out dependencies
  // at compile time, and then uses those at load time to create minimal query documents
  // We cannot do the latter at compile time due to how the #import code works.
  let operationCount = doc.definitions.reduce(function(accum, op) {
    if (op.kind === "OperationDefinition") {
      return accum + 1;
    }

    return accum;
  }, 0);

  if (operationCount >= 1) {
    outputCode += `
      const { extractReferences, oneQuery } = require('${runtimePath}');
      const definitionRefs = extractReferences(doc);
    `;

    for (const op of doc.definitions) {
      if (op.kind === "OperationDefinition") {
        if (!op.name) {
          if (operationCount > 1) {
            throw "Query/mutation names are required for a document with multiple definitions";
          } else {
            continue;
          }
        }

        const opName = op.name.value;
        outputCode += `
        module.exports["${opName}"] = oneQuery(doc, "${opName}", definitionRefs);
        `;
      }
    }
  }

  const importOutputCode = expandImports(source, doc);
  const allCode =
    headerCode + os.EOL + importOutputCode + os.EOL + outputCode + os.EOL;

  return allCode;
};
