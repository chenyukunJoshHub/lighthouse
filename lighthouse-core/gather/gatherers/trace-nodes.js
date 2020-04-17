/**
 * @license Copyright 2020 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const Gatherer = require('./gatherer.js');
const pageFunctions = require('../../lib/page-functions.js');
const TraceProcessor = require('../../lib/tracehouse/trace-processor.js');

/**
 * @return {LH.Artifacts['TraceNodes']}
 */
/* istanbul ignore next */
function collectTraceNodes() {
  /** @type {Array<HTMLElement>} */
  // @ts-ignore - put into scope via stringification
  const markedElements = getElementsInDocument('[lhtemp]'); // eslint-disable-line no-undef
  /** @type {LH.Artifacts['TraceNodes']} */
  const traceNodes = [];

  for (const element of markedElements) {
    // @ts-ignore - put into scope via stringification
    const htmlSnippet = getOuterHTMLSnippet(element); // eslint-disable-line no-undef
    traceNodes.push({
      metricTag: element.getAttribute('lhtemp') || '',
      // @ts-ignore - put into scope via stringification
      nodePath: getNodePath(element), // eslint-disable-line no-undef
      // @ts-ignore - put into scope via stringification
      selector: getNodeSelector(element), // eslint-disable-line no-undef
      // @ts-ignore - put into scope via stringification
      nodeLabel: getNodeLabel(element), // eslint-disable-line no-undef
      snippet: htmlSnippet.replace(' lhtemp="lcp"', ''),
    });
  }
  return traceNodes;
}

class TraceNodes extends Gatherer {
  /**
   * @param {LH.TraceEvent | undefined} lcpEvent
   * @return {number | undefined}
   */
  static getLCPNodeIDFromTraceEvent(lcpEvent) {
    return lcpEvent && lcpEvent.args &&
      lcpEvent.args.data && lcpEvent.args.data.nodeId;
  }

  /**
   * @param {LH.Gatherer.PassContext} passContext
   * @param {LH.Gatherer.LoadData} loadData
   * @return {Promise<LH.Artifacts['TraceNodes']>}
   */
  async afterPass(passContext, loadData) {
    const driver = passContext.driver;
    if (!loadData.trace) {
      throw new Error('Trace is missing!');
    }
    const traceOfTab = TraceProcessor.computeTraceOfTab(loadData.trace);
    const lcpEvent = traceOfTab.largestContentfulPaintEvt;
    /** @type {Array<number>} */
    const backendNodeIds = [];

    const lcpNodeId = TraceNodes.getLCPNodeIDFromTraceEvent(lcpEvent);
    if (lcpNodeId) {
      backendNodeIds.push(lcpNodeId);
    }
    // The call below is necessary for pushNodesByBackendIdsToFrontend to properly retrieve nodeIds
    await driver.sendCommand('DOM.getDocument', {depth: -1, pierce: true});
    const translatedIds = await driver.sendCommand('DOM.pushNodesByBackendIdsToFrontend',
      {backendNodeIds: backendNodeIds});


    for (let i = 0; i < backendNodeIds.length; i++) {
      // A bit hacky,
      const metricTag = lcpNodeId === backendNodeIds[i] ? 'lcp' : 'cls';
      await driver.sendCommand('DOM.setAttributeValue', {
        nodeId: translatedIds.nodeIds[i],
        name: 'lhtemp',
        value: metricTag,
      });
    }

    const expression = `(() => {
      ${pageFunctions.getElementsInDocumentString};
      ${pageFunctions.getNodePathString};
      ${pageFunctions.getNodeSelectorString};
      ${pageFunctions.getNodeLabelString};
      ${pageFunctions.getOuterHTMLSnippetString};

      return (${collectTraceNodes})();
    })()`;

    return driver.evaluateAsync(expression, {useIsolation: true});
  }
}

module.exports = TraceNodes;