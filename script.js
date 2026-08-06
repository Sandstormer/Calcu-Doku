const boardContainer = document.getElementById("board-container");
const sidebarContainer = document.getElementById("sidebar-container");
const opSymbols = ['','+','×','−','÷'];
let isMobile = false; // Whether display is altered for mobile devices
let isCandidateMode = false; // Whether "pencil mode" is activated
let cellsByGroup = [];
let clickTarget = null;
let cells = [];
let boardSize = 4;
let cellDimensions = 100; // Pixel size of each cell
const color = { green:'rgb(0, 158, 23)', red:'rgb(204, 33, 0)', purple:'rgb(140, 130, 240)', yellow:'rgb(240, 230, 140)', black:'rgb(0, 0, 0)' };
const maxGroupSizeForBoardSize = { 3:3, 4:3, 5:4, 6:4, 7:5, 8:5, 9:5 };

let showConsoleOutput = true;

let rollingSeed = getDailySeed(77); // Daily seed
// rollingSeed = Date.now(); // Variable seed

generateBoard(boardSize);
// generateBoard(boardSize, 252644551186571);
// generateBoard(7, 18052107160292);
// generateBoard(7, 36609531977608);
// generateBoard(9, 12088528880364);
// findHardestBoard(8,7);

function findHardestBoard(amount, thisSize = boardSize) {
  let hardestBoard = { time:0, seed:null };
  for (let i = 0; i < amount; i++) {
    const thisBoard = generateBoard(thisSize);
    if (thisBoard.time > hardestBoard.time) hardestBoard = { time:thisBoard.time, seed:thisBoard.seed };
  }
  logToConsole("Finished seed search after",amount,"attempts.");
  logToConsole("Hardest board is seed",hardestBoard.seed,"with a solve time of",hardestBoard.time,"ms");
}
function benchmark(amount, thisSize) {
  showConsoleOutput = false;
  const startBenchTime = Date.now();
  for (let i = 0; i < amount; i++) {
    generateBoard(thisSize);
  }
  showConsoleOutput = true;
  console.log("Benchmark Average Time:",~~((Date.now()-startBenchTime)/amount),"ms");
}
function logToConsole(...args) {
  if (showConsoleOutput) console.log(...args);
}

function generateBoard(newBoardSize = boardSize, thisSeed) {
  const getRandom = initializePRNG(thisSeed);
  if (thisSeed == null) thisSeed = rollingSeed;
  const difficultyFactor = 0.5;
  if (newBoardSize < 3 || newBoardSize > 9) {
    logToConsole("Invalid board size: Must be between 3 and 9.");
    return { time:0, seed:thisSeed };
  }
  boardSize = newBoardSize;
  logToConsole("Start of puzzle generation with seed",thisSeed);

  cells = []; // Clear all cell info
  boardContainer.innerHTML = '';
  let failedGeneration = false;
  const startTime = Date.now();

  const allNumsToGive = Array.from({ length: boardSize }, (_, i) => i + 1);
  const allIndexes = [...Array(boardSize).keys()];
  assignNumbers();
  function assignNumbers() {
    for (let i = 0; i < boardSize; i++) { // Create each cell in the grid, and assign numbers **************
      const newRow = document.createElement('div'); 
      newRow.className = 'row';
      boardContainer.appendChild(newRow);
      let rowAssignRetryCount = 0;
      for (let j = 0; j < boardSize && rowAssignRetryCount < 1000; j++) {
        const newCell = document.createElement('div'); 
        newCell.className = 'cell';
        newCell.row = i;
        newCell.col = j;
        newCell.index = j + i * boardSize;
        newCell.operator = -1;
        newCell.result = 0;
        
        // Assign the value of the cell (will be hidden after)
        numsToGive = allNumsToGive.filter(thisNum => !cells.some(cell => (cell.row==i || cell.col==j) && cell.value==thisNum));
        if (numsToGive.length == 0) { // If there are no valid numbers to place, delete the row and try again
          newRow.innerHTML = '';
          while (j > 0) { // Remove all cells in the row
            cells.pop()
            j--;
          }
          j = -1;
          rowAssignRetryCount++;
          logToConsole(`Retried assigning numbers to row. Attempt ${rowAssignRetryCount}.`);
          continue; // Restart the row from column 0
        }
        newCell.value = numsToGive[Math.floor(getRandom() * numsToGive.length)];
        newCell.answer = newCell.value;
        newCell.group = null;
        newCell.candidates = [...allNumsToGive];
        newCell.isLeader = false;
        newCell.addEventListener('click', () => clickTarget = newCell);
        newRow.appendChild(newCell);
        cells.push(newCell);
      }
    }
  }
  logToConsole("Cells after number placement:",cells);
  const cellsByRow    = allIndexes.map(i => cells.filter(c => c.row == i));
  const cellsByColumn = allIndexes.map(i => cells.filter(c => c.col == i));
  cells.forEach(thisCell => thisCell.impactedCells = cells.filter(c => c != thisCell && (c.row == thisCell.row) != (c.col == thisCell.col)));

  assignAllGroups();
  function assignAllGroups() {
    let thisGroup = 100;
    const maxGroupSize = maxGroupSizeForBoardSize[boardSize];
    initializeGroups(0.4,0.2);
    initializeGroups(1,0.3);
    finalizeGroups(0.6 + boardSize/30);
    sequentializeGroups();
    function initializeGroups(assignChance = 1, mergeChance = 0) { // Cluster the cells into groups **************
      cells.forEach((thisCell, thisIndex) => {
        const partners = [ // Stay within the limits of the board
          thisIndex >= boardSize              ? thisIndex-boardSize : -1, // up
          thisIndex%boardSize                 ? thisIndex-1         : -1, // left
          thisIndex < boardSize*(boardSize-1) ? thisIndex+boardSize : -1, // down
          thisIndex%boardSize  != boardSize-1 ? thisIndex+1         : -1  // right
        ];
        if (getRandom() < mergeChance) { // Merge current cell into the group of an adjacent cell
          // Can only merge if current cell has no group, or if in a group smaller than 3 (to avoid splitting groups into non-adjacent cells)
          if ( thisCell.group == null || cells.filter(c => c.group === thisCell.group).length < 3 ) {
            const mergeableIndexes = partners.filter((value) => value >= 0 && cells[value].group); // Partner must have a group
            if (mergeableIndexes.length) { // If there is a valid partner
              const partnerIndex = mergeableIndexes[Math.floor(getRandom() * mergeableIndexes.length)];
              const targetGroup = cells[partnerIndex].group;
              const groupSize = cells.filter(cell => cell.group === targetGroup).length;
              if (groupSize < maxGroupSize-1 && getRandom() < mergeChance**(groupSize-2)) { // Less likely to form huge groups
                thisCell.group = targetGroup;
              }
            }
          }
        }
        if (getRandom() < assignChance) { // Make new group with a partner
          if (thisCell.group == null) { // If the current cell has no group
            const blankIndexes = partners.filter((value) => value >= 0 && cells[value].group == null); // Partner must have no group
            if (blankIndexes.length) { // If there is a valid partner
              const partnerIndex = blankIndexes[Math.floor(getRandom() * blankIndexes.length)];
              thisCell.group = thisGroup;
              cells[partnerIndex].group = thisGroup;
              thisGroup += 1;
            }
          }
        }
      }); 
    }
    function finalizeGroups(loneMergeChance = 0.8) { // Final pass to clean up groups **************
      cells.forEach((thisCell, thisIndex) => {
        const partners = [ // Stay within the limits of the board
          thisIndex >= boardSize              ? thisIndex-boardSize : -1, // up
          thisIndex%boardSize                 ? thisIndex-1         : -1, // left
          thisIndex < boardSize*(boardSize-1) ? thisIndex+boardSize : -1, // down
          thisIndex%boardSize != boardSize-1  ? thisIndex+1         : -1  // right
        ];
        if (thisCell.group == null) { // Assign a new group to each lone cell
          thisCell.group = thisGroup;
          thisGroup += 1;
        }
        if (cells.filter(cell => cell.group === thisCell.group).length == 1) { // If the current cell is in a lone group
          const lonePartners = partners.filter(i => i != -1 && ( cells[i].group == null || cells.filter(cell => cell.group === cells[i].group).length == 1 ) );
          if (lonePartners.length) { // If there is an adjacent cell in a lone group, always merge with it
            const partnerIndex = lonePartners[Math.floor(getRandom() * lonePartners.length)];
            cells[partnerIndex].group = thisCell.group;
          } else if (getRandom() < loneMergeChance) { // Chance to merge current lone cell into group of an adjacent cell
            const mergeableIndexes = partners.filter(i => i != -1 && cells[i].group); // Partner must have a group
            if (mergeableIndexes.length) { // If there is a valid partner
              const partnerIndex = mergeableIndexes[Math.floor(getRandom() * mergeableIndexes.length)];
              const targetGroup = cells[partnerIndex].group;
              const groupSize = cells.filter(cell => cell.group === targetGroup).length;
              if (groupSize < maxGroupSize-1 && getRandom() < loneMergeChance**(groupSize-2)) { // Less likely to form huge groups
                thisCell.group = targetGroup;
              }
            }
          }
        }
      }); 
    }
    function sequentializeGroups() { // Re-order the group numbers to start at 0, and not skip any numbers
      if (thisGroup > 100) thisGroup = 0;
      cells.forEach(thisCell => {
        if (thisCell.group >= 100) {
          const groupToReplace = thisCell.group;
          cells.filter(c => c.group == groupToReplace).forEach(c => c.group = thisGroup);
          thisGroup++;
        }
      });
      groupList = [...Array(thisGroup).keys()];
    }
  }
  logToConsole("Finished assigning groups");
  
  // Check for square degeneracies of numbers, i.e two adjacent groups that are like [ 1 , 3 ]
  // This is a quick identifier of multiple solutions                                [ 3 , 1 ]
  for (let x = 0; x < boardSize-1; x++) {
    for (let y = 0; y < boardSize-1; y++) {
      for (let w = 1; w < boardSize-1-x; w++) {
        for (let h = 1; h < boardSize-1-y; h++) {
          if ( cells[x  +y*boardSize].value == cells[x+w+(y+h)*boardSize].value
            && cells[x+w+y*boardSize].value == cells[x  +(y+h)*boardSize].value
            && ( ( cells[x+y*boardSize].group == cells[x+w+y*boardSize].group && cells[x+(y+h)*boardSize].group == cells[x+w+(y+h)*boardSize].group ) 
              || ( cells[x+y*boardSize].group == cells[x+(y+h)*boardSize].group && cells[x+w+y*boardSize].group == cells[x+w+(y+h)*boardSize].group ) )
          ) {
            logToConsole(`Square Degen found: ${x+y*boardSize} ${x+w+(y+h)*boardSize} ${x+w+y*boardSize} ${x+(y+h)*boardSize}`);
            logToConsole("Generating new board...");
            return generateBoard(boardSize); // Terminate the current puzzle and generate a completely new puzzle
          }
        }
      }
    }
  }

  // Draw the group borders
  cells.forEach((thisCell, i) => {
    thisCell.classList = "cell";
    if (thisCell.row != 0           && cells[i-boardSize].group == thisCell.group) thisCell.classList.add("no-top");
    if (thisCell.row != boardSize-1 && cells[i+boardSize].group == thisCell.group) thisCell.classList.add("no-bot");
    if (thisCell.col != 0           && cells[i-1].group == thisCell.group)         thisCell.classList.add("no-left");
    if (thisCell.col != boardSize-1 && cells[i+1].group == thisCell.group)         thisCell.classList.add("no-right");
    cells.filter(c => c.group === thisCell.group)[0].isLeader = true;
  });
  
  // Assign the operators to each group
  cellsByGroup = groupList.map(thisGroup => cells.filter(c => c.group == thisGroup)); // Record the cells in each group
  cells.forEach(thisCell => {
    if (thisCell.operator == -1) {
      const groupSize = cells.filter(c => c.group === thisCell.group).length;
      if (groupSize == 1) {
        thisCell.operator = 0;
      } else if (groupSize == 2) {
        const partner = cells.filter(c => c.group === thisCell.group && c != thisCell)[0];
        const divided = (partner.value > thisCell.value ? partner.value / thisCell.value : thisCell.value / partner.value);
        if (divided%1 == 0 && getRandom() < 0.5) { // If the divided result is a whole number
          thisCell.operator = 4; // Set to divide
        } else if (getRandom() < 0.4) {
          thisCell.operator = 3; // Set to subtract
        }
      } 
      if (thisCell.operator == -1) { // For larger groups, or if smaller groups didn't assign yet
        if (getRandom() < 0.45 && cellsByGroup[thisCell.group].reduce((total, c) => total * c.value, 1) < 300) {
          thisCell.operator = 2; // Set to multiply
        } else {
          thisCell.operator = 1; // Set to add
        }
      }
      // Assign operator to other cells in the same group
      cells.filter(c => c.group == thisCell.group).forEach(c => c.operator = thisCell.operator);
    }
  });

  logToConsole("Starting Basic Techniques. Current time is",Date.now()-startTime,"ms.");
  cells.forEach(thisCell => thisCell.result = calcResultForGroup(thisCell.group)); // Determine the equation results
  combinationsByGroup = groupList.map(thisGroup => generateCombinations(thisGroup)); // Determine unique combinations for each group
  logToConsole("Generated initial group combos. Current time is",Date.now()-startTime,"ms.");
  logToConsole("Combos By Group:",combinationsByGroup);
  let totalCombinations = combinationsByGroup.reduce((total, theseCombos) => total + theseCombos.length, 0);
  let totalCombinationsPrev = null;
  let techniquesPassCount = 1;
  // Loop the basic techniques until nothing new is found
  while (totalCombinations < totalCombinationsPrev || techniquesPassCount == 1) {
    totalCombinationsPrev = totalCombinations;
    // Find candidates for individual cells, based off valid combos for each group 
    groupList.forEach(thisGroup => cellsByGroup[thisGroup].forEach((c,i) => 
      c.candidates = [...new Set(combinationsByGroup[thisGroup].map(thisCombo => thisCombo[i]))].filter(value => c.candidates.includes(value)).sort() ));
    logToConsole("Cell Candidates:",cells.map(c => c.candidates));
    // "Lone Position" Technique: Rows or columns that only have one valid position for a particular number
    for (let row = 0; row < boardSize; row++) {
      for (let number = 1; number < boardSize+1; number++) {
        const cellsWithThatNumber = cellsByRow[row].filter(c => c.candidates.includes(number));
        if (cellsWithThatNumber.length == 0) logToConsole(`Error: No valid spot for ${number} in row ${row}`);
        if (cellsWithThatNumber.length == 1 && cellsWithThatNumber[0].candidates.length > 1) {
          cellsWithThatNumber[0].candidates = [number];
          logToConsole(`Found lone position for ${number} in row ${row}`);
        }
      }
    }
    for (let col = 0; col < boardSize; col++) {
      for (let number = 1; number < boardSize+1; number++) {
        const cellsWithThatNumber = cellsByColumn[col].filter(c => c.candidates.includes(number));
        if (cellsWithThatNumber.length == 0) logToConsole(`Error: No valid spot for ${number} in column ${col}`);
        if (cellsWithThatNumber.length == 1 && cellsWithThatNumber[0].candidates.length > 1) {
          cellsWithThatNumber[0].candidates = [number];
          logToConsole(`Found lone position for ${number} in column ${col}`);
        }
      }
    }
    // "Single Elimination" Technique: If a group forces a number to be always be in a line, eliminate that number for the whole line
    groupList.forEach(thisGroup => {
      if (combinationsByGroup[thisGroup].length > 1) { // If there is only one combo, this whole technique is redundant
        const rowsToCheck = new Set(cellsByGroup[thisGroup].map(c => c.row));
        rowsToCheck.forEach(row => {
          const numbersToCheck = [...new Set(combinationsByGroup[thisGroup].flatMap(thisCombo => thisCombo.filter((_,i) => cellsByGroup[thisGroup][i].row == row)))];
          numbersToCheck.forEach(thisNum => {
            // If every combo in that group has some cell with that number in that row
            if (combinationsByGroup[thisGroup].every(thisCombo => thisCombo.some((value,i) => value == thisNum && cellsByGroup[thisGroup][i].row == row))) {
              const cellsToDo = cellsByRow[row].filter(c => c.group != thisGroup && c.candidates.includes(thisNum));
              if (cellsToDo.length) {
                cellsToDo.forEach(c => c.candidates = c.candidates.filter(value => value != thisNum));
                logToConsole("Single elimination found in group",thisGroup,"for number",thisNum,"in row",row);
              }
            }
          });
        });
        const columnsToCheck = new Set(cellsByGroup[thisGroup].map(c => c.col));
        columnsToCheck.forEach(col => {
          const numbersToCheck = [...new Set(combinationsByGroup[thisGroup].flatMap(thisCombo => thisCombo.filter((_,i) => cellsByGroup[thisGroup][i].col == col)))];
          numbersToCheck.forEach(thisNum => {
            // If every combo in that group has some cell with that number in that column
            if (combinationsByGroup[thisGroup].every(thisCombo => thisCombo.some((value,i) => value == thisNum && cellsByGroup[thisGroup][i].col == col))) {
              const cellsToDo = cellsByColumn[col].filter(c => c.group != thisGroup && c.candidates.includes(thisNum));
              if (cellsToDo.length) {
                cellsToDo.forEach(c => c.candidates = c.candidates.filter(value => value != thisNum));
                logToConsole("Single elimination found in group",thisGroup,"for number",thisNum,"in column",col);
              }
            }
          });
        });
      }
    });
    // "Double Elimination" Technique: If two cells in a line have the same only two candidates, eliminate those numbers for the whole line
    for (let row = 0; row < boardSize; row++) {
      if (cellsByRow[row].filter(c => c.candidates.length == 2).length >= 2) {
        for (let thisIndex = row*boardSize; thisIndex%boardSize < boardSize-1; thisIndex++) {
          const mainCands = cells[thisIndex].candidates;
          if (mainCands.length == 2) {
            for (let partnerIndex = thisIndex+1; partnerIndex%boardSize > 0; partnerIndex++) {
              const partnerCands = cells[partnerIndex].candidates;
              if (partnerCands.length == 2 && mainCands.includes(partnerCands[0]) && mainCands.includes(partnerCands[1])) {
                const cellsToDo = cellsByRow[row].filter(c => c.index != thisIndex && c.index != partnerIndex 
                  && ( c.candidates.includes(mainCands[0]) || c.candidates.includes(mainCands[1]) ) );
                if (cellsToDo.length) {
                  cellsToDo.forEach(c => c.candidates = c.candidates.filter(v => !mainCands.includes(v)));
                  logToConsole(`Found double elimination for ${partnerCands[0]} & ${partnerCands[1]} in row ${row}`);
                }
              }
            }
          }
        }
      }
    }
    for (let col = 0; col < boardSize; col++) {
      if (cellsByColumn[col].filter(c => c.candidates.length == 2).length >= 2) {
        for (let thisIndex = col; thisIndex < boardSize**2-boardSize; thisIndex = thisIndex+boardSize) {
          for (let partnerIndex = thisIndex+boardSize; partnerIndex < boardSize**2; partnerIndex = partnerIndex+boardSize) {
            const candA = cells[thisIndex].candidates;
            const candB = cells[partnerIndex].candidates;
            if (candA.length == 2 && candB.length == 2) {
              if (candA.includes(candB[0]) && candA.includes(candB[1])) {
                const cellsToDo = cellsByColumn[col].filter(c => c.index != thisIndex && c.index != partnerIndex 
                  && ( c.candidates.includes(candA[0]) || c.candidates.includes(candA[1]) ) );
                if (cellsToDo.length) {
                  cellsToDo.forEach(c => c.candidates = c.candidates.filter(v => !candA.includes(v)));
                  logToConsole(`Found double elimination for ${candB[0]} & ${candB[1]} in column ${col}`);
                }
              }
            }
          }
        }
      }
    }
    logToConsole("Cell Candidates After Pass:",cells.map(c => c.candidates));
    // Update the valid combos for each group, based on new findings regarding individual candidates
    combinationsByGroup = groupList.map(thisGroup => generateCombinations(thisGroup));
    logToConsole("Combos By Group:",combinationsByGroup);
    // "Dead End" Technique: Test each combo and see if it invalidates another group right away
    // This is quite slow, and sometimes not even worth it
    totalCombinations = combinationsByGroup.reduce((total, theseCombos) => total + theseCombos.length, 0);
    if (totalCombinations == totalCombinationsPrev) { // Only runs as a last resort, if all other techniques found nothing this pass
      logToConsole("Running Dead End technique in Pass",techniquesPassCount);
      groupList.filter(thisGroup => combinationsByGroup[thisGroup].length < 20).forEach(thisGroup => // For each group that isn't too big
        combinationsByGroup[thisGroup] = combinationsByGroup[thisGroup].filter(thisCombo => { // Remove combos which are a dead end
        cells.forEach(c => c.value = ( c.candidates.length == 1 ? c.candidates[0] : 0 ) ); // Reset all cell values, but fill in cells that only have one candidate
        cellsByGroup[thisGroup].forEach((c,i) => c.value = thisCombo[i]); // Fill in the cells from this combo
        const isValidCombo = groupList.filter(secGroup => secGroup != thisGroup).every(g => // Check all other groups
          combinationsByGroup[g].length > 20 || // Short-circuit if secondary group is too big
          combinationsByGroup[g].some(secCombo => // Must have at least one valid combo left
            // Every cell in that combo must have no conflicts in the row or column
            cellsByGroup[g].every((secCell,i) => !secCell.impactedCells.some(c => c.value == secCombo[i]))
        ));
        if (!isValidCombo) logToConsole("Found dead end combo",thisCombo,"in group",thisGroup);
        return isValidCombo;
      }));
    }
    // Report the end of this pass
    logToConsole("Combo Counts:",[...combinationsByGroup.map(c => c.length)]);
    totalCombinations = combinationsByGroup.reduce((total, theseCombos) => total + theseCombos.length, 0);
    logToConsole("Finished Pass",techniquesPassCount++,"of Basic Techniques.",totalCombinations,"total group combos. Current time is",Date.now()-startTime,"ms.");
  }
  logToConsole("Finished All Basic Techniques in",Date.now()-startTime,"ms");

  function generateCombinations(thisGroup) { // This function lists valid combos of numbers for cells in that group
    const theseCombos = [];
    // Reset all cell values, but fill in cells that only have one candidate
    cells.forEach(c => c.value = ( c.candidates.length == 1 ? c.candidates[0] : 0 ) );
    function build(cellValuesInCombo, thisGroup) {
      if (cellValuesInCombo.length === cellsByGroup[thisGroup].length) {
        if (calcResultForGroup(thisGroup) == cellsByGroup[thisGroup][0].result) { // If math result matches
          theseCombos.push([...cellValuesInCombo]); // Record as a valid combo for this group
        }
        return;
      }
      const thisCell = cellsByGroup[thisGroup][cellValuesInCombo.length];
      thisCell.candidates.forEach(thisNum => { // Only try numbers in the candidate list
        if (!thisCell.impactedCells.some(c => c.value == thisNum)) { // Check that there are no dupes in the same line
          thisCell.value = thisNum; // Place the latest value into the actual cell
          build([...cellValuesInCombo,thisNum], thisGroup); // Continue building a valid combo for this group
        }
      });
      thisCell.value = 0; // Clear the value, so it doesn't remain once the function has walked back
    }
    build([], thisGroup);
    return theseCombos;
  }

  logToConsole("Group List:",groupList);
  logToConsole("Cells By Group:",cellsByGroup);
  logToConsole("Combos By Group:",combinationsByGroup);
  
  let totalNodeCount = 0;
  let solutionsFound = [];
  groupList.sort((a,b) => combinationsByGroup[b].length-combinationsByGroup[a].length);
  logToConsole("Sorted Group List:",groupList);
  indexesByImpact = cells.map(thisCell => thisCell.impactedCells.map(c => c.index));
  // Test all the combinations of each group, to find how many solutions there are
  testCombinations(cells.map(c => 0), [...groupList]);
  function testCombinations(cellTestValues, groupTestList) {
    if (groupTestList.length == 0) {
      solutionsFound.push([...cellTestValues]);
      if (solutionsFound.length > 1) failedGeneration = true; // If there is more than one solution, terminate early
      return; // Terminate this branch if all groups have been placed (which means a valid solution)
    }
    if (failedGeneration) return; // Terminate all branches if there are already 2 solutions
    const thisGroup = groupTestList.pop();
    combinationsByGroup[thisGroup].forEach( thisCombo => { // Loop through each combo in this group
      totalNodeCount++; // Track how many nodes have been searched
      cellsByGroup[thisGroup].forEach(c => cellTestValues[c.index] = 0); // Clear the value of each cell in this group
      let isValidCombo = true;
      // Place the values of that combo in the cell test values (this is not the actual cells)
      thisCombo.forEach( (value,orderInGroup) => {
        const thisIndex = cellsByGroup[thisGroup][orderInGroup].index;
        cellTestValues[thisIndex] = value;
        if (indexesByImpact[thisIndex].some(i => cellTestValues[i] == value)) 
          isValidCombo = false; // Reject if duplicate numbers in a line
      });
      // Call the function for the next group if there are no row or column issues
      if (isValidCombo) testCombinations([...cellTestValues], [...groupTestList]);
    });
    function seeBoardState() {
      logToConsole('Board State:');
      allIndexes.forEach(row => {
        logToConsole(...cellTestValues.slice(row*boardSize,(row+1)*boardSize).map(i => i||"-"));
      });
    }
  }
  logToConsole("Total Nodes Searched:",totalNodeCount);
  logToConsole("Solutions Found:",solutionsFound);
  logToConsole("Finished puzzle generation with seed",thisSeed);
  console.log("Total Generation Time:",Date.now()-startTime,"ms");

  if (failedGeneration) {
    logToConsole("Multiple solutions found during final search. Generating new board...");
    return generateBoard(boardSize); // Terminate the current puzzle and generate a completely new puzzle
  }
  
  cells.forEach(thisCell => {
    thisCell.value = 0; // Hide the cell values
    thisCell.addEventListener('mouseover', () => clickTarget = thisCell);
    thisCell.candidates = [];
  });
  adjustLayout();
  updateCellDisplay();
  return { time:Date.now()-startTime, seed:thisSeed }; // Return generation time and seed
}

function initializePRNG(forcedSeed) { // Mulberry 32 algorithm for RNG
  return function() {
    if (forcedSeed) var t = forcedSeed += 0x6D2B79F5;
    else var t = rollingSeed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
function getDailySeed(seedOffset = 77) { // Get a reliable seed for the day (e.g., 20260720)
  const d = new Date();
  const year = d.getFullYear(); // Four digit year
  const month = String(d.getMonth() + 1).padStart(2, '0'); // Months are 0-11
  const day = String(d.getDate()).padStart(2, '0'); // Two digit day of the month
  return parseInt(`${year}${month}${day}${seedOffset}`, 10);
}

function calcResultForGroup(thisGroup) {
  const cellsInThisGroup = cellsByGroup[thisGroup];
  const thisOperator = cellsInThisGroup[0].operator;
  if (thisOperator == 0) return cellsInThisGroup[0].value; // If alone, there is no operator
  if (thisOperator == 1) return cellsInThisGroup.reduce((total, c) => total + c.value, 0); // Add
  if (thisOperator == 2) return cellsInThisGroup.reduce((total, c) => total * c.value, 1); // Multiply
  if (thisOperator == 3) return Math.abs(cellsInThisGroup[0].value - cellsInThisGroup[1].value); // Subtract
  if (thisOperator == 4) return Math.max(cellsInThisGroup[0].value, cellsInThisGroup[1].value) / Math.min(cellsInThisGroup[0].value, cellsInThisGroup[1].value); // Divide
}

function updateCellDisplay() { // Update the cell display
  cells.forEach(thisCell => {
    const resultColor = ( cellsByGroup[thisCell.group].some(c => c.value == 0) ? color.black : // Show mod as black if group is incomplete
      ( calcResultForGroup(thisCell.group) == thisCell.result ? color.green : color.red ));    // Or show as green/red if result is correct/wrong
    const valueColor = ( thisCell.impactedCells.some(c => c.value == thisCell.value) ? color.red : color.black ); // Show value as red is there is a duplicate
    const modFontSize = ~~Math.min(36, cellDimensions/4); // Scale size of the modifier text
    const candFontSize = ~~Math.min(30, modFontSize*0.9, cellDimensions/thisCell.candidates.length*1.1); // Scale size of the candidates
    thisCell.innerHTML = `<div class="cell-value" style="color:${valueColor};">${thisCell.value ? thisCell.value : ''}</div>
      <div class="mod-text" style="color:${resultColor}; font-size:${modFontSize}px;">${thisCell.isLeader ? thisCell.result : ''} ${thisCell.isLeader ? opSymbols[thisCell.operator] : ''}</div>
      <div class="candidates" style="font-size:${candFontSize}px;">${thisCell.candidates.join(' ')}</div>`;
  });
  updateCellHighlight();
}
function updateCellHighlight() { // Update the cell background color
  cells.forEach(thisCell => { // Highlight the cell if it is selected
    thisCell.style.backgroundColor = "#EEEEEE";
    if (clickTarget == thisCell) thisCell.style.backgroundColor = ( isCandidateMode ? color.purple : color.yellow );
  });
}

function adjustLayout() {
  isMobile = (window.innerWidth <= 768);
  // Set dimensions of everything to be integers, to prevent subpixel rounding
  const newCellDimensions = Math.max(~~(((Math.min(window.innerHeight,window.innerWidth)-60)*0.85)/boardSize)-4,50);
  if (newCellDimensions != cellDimensions) {
    cellDimensions = newCellDimensions;
    document.documentElement.style.setProperty("--cell-size", `${cellDimensions}px`);
    document.documentElement.style.setProperty("--row-size", `${cellDimensions+4}px`);
    document.documentElement.style.setProperty("--board-size", `${cellDimensions*boardSize+6*(boardSize-1)}px`);
    updateCellDisplay();
  }
}

document.addEventListener('mousemove', (event) => {
  updateCellHighlight();
});
document.addEventListener('keydown', (event) => {
  [1,2,3,4,5,6,7,8,9].forEach(number => {
    if (event.key == number && number <= boardSize && clickTarget) {
      if (isCandidateMode) {
        if (!clickTarget.candidates.includes(number)) {
          clickTarget.candidates = [number,...clickTarget.candidates].sort();
        }
      } else {
        clickTarget.value = number;
        clickTarget.candidates = [];
      }
    }
  });
  if (['0','`','Escape','Backspace','Delete'].includes(event.key)) {
    if (isCandidateMode) {
      clickTarget.candidates = []; // Clear the cell's candidates
    } else {
      clickTarget.value = 0; // Clear the cell's value
    }
  }
  if (event.key == "c") isCandidateMode = !isCandidateMode;
  updateCellDisplay();
});
window.addEventListener("resize", () => adjustLayout()); // Run on page load and when resizing the window