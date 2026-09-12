const boardContainer  = document.getElementById("board-container");
const inputContainer  = document.getElementById("input-container");
const pencilContainer = document.getElementById("pencil-container");
const opSymbols = ['','+','×','−','÷','?'];

let isMobile = false; // Whether display is altered for mobile devices
let isPencilMode = false; // Whether "pencil mode" is activated
let isPuzzleComplete = false;
let isConsoleOutput = true;
const isDebugMode = false;

let cells = []; // List of all cell elements
let cellsByGroup = []; // Sublists of all cells, arranged by group
let groupList = [];
let operatorsByGroup = [];
let resultByGroup = [];
let listOfUndoStates = [];
let tempUndoState = [];
let inputButtons = [];
let clickTarget = null; // Which cell is selected for number entry
let rollingSeed = getDailySeed(); // Daily seed

let boardSize = 4;
let currentBoardOptions = ['1','1','1',boardSize];

let cellDimensions = 100; // Pixel size of each cell
const maxGroupSizeForBoardSize = { 3:3, 4:3, 5:4, 6:4, 7:5, 8:5, 9:5 };
const allOperatorsOptions = {
  // key = third digit in board options code ( i.e. ##1# )
  // value = indexes of available operators ( 0 = '', 1 = +, 2 = ×, 3 = −, 4 = ÷, 5 = ? )
  1: [0,1,2,3,4], // Default
  2: [1,2,3,4], // No Solos
  3: [0,1,3], // Plus Minus
  4: [0,1,2], // Plus Mult
  5: [0,2,4], // Mult Divide
  6: [0,1], // Plus
  7: [0,2], // Mult
  8: [0,1,2,3,4,5], // Blind
  // 9: [], // Reserved (currently not implemented)
}
const color = {
  black:'rgb(  0,  0,  0)', green: 'rgb(  0, 150,   0)', red:   'rgb(220,  30,   0)',
  cell: 'rgb(238,238,238)', purple:'rgb(173, 165, 255)', yellow:'rgb(240, 230, 140)',
  grey: 'rgb(160,160,160)',
};

generateBoard(boardSize);
// generateBoard(8236058721118);

function findHardestBoard(amount, thisSize = boardSize) {
  let hardestBoard = { time:0, seed:null };
  isConsoleOutput = false;
  const startBenchTime = Date.now();
  for (let i = 0; i < amount; i++) {
    const thisBoard = generateBoard(thisSize);
    if (thisBoard.time > hardestBoard.time) hardestBoard = { time:thisBoard.time, seed:thisBoard.seed };
  }
  isConsoleOutput = true;
  hardestBoard = generateBoard(hardestBoard.seed);
  logBlankLine();
  logToConsole("Finished seed search after",amount,"attempts.\nTotal time of",Date.now()-startBenchTime,"ms.");
  logToConsole("Hardest board is seed",hardestBoard.seed,"with a solve time of",hardestBoard.time,"ms.");
}
function benchmark(amount, thisSize = boardSize) {
  isConsoleOutput = false;
  const startBenchTime = Date.now();
  const operatorCount = [0,0,0,0];
  for (let i = 0; i < amount; i++) {
    generateBoard(thisSize);
    operatorCount.forEach((_,i) => operatorCount[i] += operatorsByGroup.filter(c => c == i+1).length);
  }
  isConsoleOutput = true;
  logToConsole("Occurrences of each operator:",operatorCount.flatMap((c,i) => [opSymbols[i+1],c]));
  console.log("Finished benchmark with total time of",Date.now()-startBenchTime,"ms.");
  console.log("Benchmark Average Time:",~~((Date.now()-startBenchTime)/amount),"ms.");
}
function logToConsole(...args) {
  if (isConsoleOutput) console.log(...args);
}
function logBlankLine() {
  if (isConsoleOutput) console.log();
}

//region Generate Board
function generateBoard(seedOrSize = null) {
  function failWithError(errorString) {
    console.error(errorString);
    return { time:0, seed:seedOrSize };
  }
  // If seed is too large, the final digits don't parse correctly
  if (seedOrSize > 10**14) failWithError("Seed too large. Must be less than 15 digits.");
  // seedOrSize is either a full seed (5 to 14 digits), or an options code (1 to 4 digits)
  // If an option digit is 0, or invalid, or unspecified, it will use the previously valid choice for that option
  // If the option code is just 1 digit, it will specify board size, and other digits will be 0
  // If seedOrSize is greater than 4 digits, the final 4 digits are the options code, and the earlier digits are the seed
  const newBoardOptions = ( seedOrSize == null ? currentBoardOptions : seedOrSize.toString().slice(-4).padStart(4,0).split('').map(Number) );
  // Check for invalid options, and set them back to 0
  if (!(newBoardOptions[2] in allOperatorsOptions)) newBoardOptions[2] = 0;
  if (newBoardOptions[3] < 3) failWithError("Invalid board size: Must be between 3 and 9.");
  newBoardOptions[0] = 0; // [0] is group options (default 1) (currently not implemented)
  // 1 = Normal, 2 = Just Duos, 3 = No Solos, 4 = Huge Groups, 5 = Symmetric Groups
  newBoardOptions[1] = 0; // [1] is difficulty    (default 1) (currently not implemented)
  // For all non-zero options, set those as the current board options
  newBoardOptions.forEach((thisNum,i) => { if (thisNum) currentBoardOptions[i] = thisNum; });
  const allOperatorsToGive = allOperatorsOptions[currentBoardOptions[2]]; // Option [2] is operators (default 1)
  boardSize = currentBoardOptions[3]; // Option [3] is board size (must be between 3 and 9)

  // If a full seed is specified, use that, otherwise add the suffix to the rolling seed
  const thisSeed = Number( ( seedOrSize > 9999 ? (~~(seedOrSize/10000))|0 : rollingSeed ) + currentBoardOptions.join('') );
  const fallbackSeed = ( seedOrSize > 9999 ? (~~(seedOrSize/10000) + 0x6D2B79F5)|0 : '' ) + currentBoardOptions.join('');
  const getRandom = initializePRNG( seedOrSize > 9999 ? ~~(thisSeed/10000) : null );
  logBlankLine();
  logToConsole("Start of puzzle generation with seed",thisSeed);
  
  cells = []; // Clear all cell info
  boardContainer.innerHTML = '';
  let failedGeneration = false;
  const startTime = Date.now();

  const allNumsToGive = Array.from({ length: boardSize }, (_, i) => i + 1);
  const allIndexes = [...Array(boardSize).keys()];
  assignNumbers();
  function assignNumbers() {
    let numberAssignRetryCount = 0;
    for (let i = 0; i < boardSize; i++) { // Create each cell in the grid, and assign numbers **************
      const newRow = document.createElement('div'); 
      newRow.className = 'row';
      boardContainer.appendChild(newRow);
      for (let j = 0; j < boardSize && numberAssignRetryCount < 1000; j++) {
        const newCell = document.createElement('div'); 
        newCell.className = 'cell';
        newCell.row = i;
        newCell.col = j;
        newCell.index = j + i * boardSize;
        newCell.operator = -1;
        newCell.result = 0;
        
        // Assign the value of the cell (will be hidden after)
        const numsToGive = allNumsToGive.filter(thisNum => !cells.some(cell => (cell.row==i || cell.col==j) && cell.value==thisNum));
        if (numsToGive.length == 0) { // If there are no valid numbers to place, delete the row and try again
          newRow.innerHTML = '';
          while (j > 0) { // Remove all cells in the row
            cells.pop()
            j--;
          }
          j = -1;
          numberAssignRetryCount++;
          continue; // Restart the row from column 0
        }
        newCell.value = numsToGive[Math.floor(getRandom() * numsToGive.length)];
        if (isDebugMode) newCell.answer = newCell.value;
        newCell.group = null;
        newCell.candidates = [...allNumsToGive];
        newCell.isLeader = false;
        newCell.addEventListener('click',     () => updateCellHighlight(newCell));
        newCell.addEventListener('mouseover', () => updateCellHighlight(newCell, true));
        newCell.addEventListener('mouseout',  () => updateCellHighlight(null, true));
        newRow.appendChild(newCell);
        cells.push(newCell);
      }
    }
    logToConsole("Finished assigning numbers after",numberAssignRetryCount,"attempts.");
  }
  logToConsole("Cells after number placement:",cells);
  const cellsByRow    = allIndexes.map(i => cells.filter(c => c.row == i));
  const cellsByColumn = allIndexes.map(i => cells.filter(c => c.col == i));
  cells.forEach(thisCell => thisCell.impactedCells = cells.filter(c => (c.row == thisCell.row) != (c.col == thisCell.col)));

  let thisGroup = 100;
  const maxGroupSize = maxGroupSizeForBoardSize[boardSize];
  initializeGroups(0.4,0.2);
  initializeGroups(1,0.3);
  const soloMergeChance = ( allOperatorsToGive.includes(0) ? 0.6 + boardSize/30 : 1 );
  finalizeGroups(soloMergeChance);
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
            if (groupSize < maxGroupSize && getRandom() < mergeChance**(groupSize-2)) { // Less likely to form huge groups
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
  function finalizeGroups(soloMergeChance = 1) { // Final pass to clean up groups **************
    cells.forEach((thisCell, thisIndex) => {
      const partners = [ // Stay within the limits of the board
        thisIndex >= boardSize              ? thisIndex-boardSize : -1, // up
        thisIndex%boardSize                 ? thisIndex-1         : -1, // left
        thisIndex < boardSize*(boardSize-1) ? thisIndex+boardSize : -1, // down
        thisIndex%boardSize != boardSize-1  ? thisIndex+1         : -1  // right
      ];
      if (thisCell.group == null) { // Assign a new group to each solo cell
        thisCell.group = thisGroup;
        thisGroup += 1;
      }
      if (cells.filter(c => c.group === thisCell.group).length == 1) { // If the current cell is in a solo group
        const soloPartners = partners.filter(i => i != -1 && ( cells[i].group == null || cells.filter(c => c.group === cells[i].group).length == 1 ) );
        if (soloPartners.length) { // If there is an adjacent cell in a solo group, always merge with it
          const partnerIndex = soloPartners[Math.floor(getRandom() * soloPartners.length)];
          cells[partnerIndex].group = thisCell.group;
        } else if (getRandom() < soloMergeChance) { // Chance to merge current solo cell into group of an adjacent cell
          // Partner must have an assigned group, which is not already at max size
          const mergeableIndexes = partners.filter(i => i != -1 && cells[i].group && cells.filter(c => c.group === cells[i].group).length < maxGroupSize);
          if (mergeableIndexes.length) { // If there is a valid partner
            const partnerIndex = mergeableIndexes[Math.floor(getRandom() * mergeableIndexes.length)];
            const targetGroup = cells[partnerIndex].group;
            const groupSize = cells.filter(c => c.group === targetGroup).length;
            if (getRandom() < soloMergeChance**(groupSize-2)) { // Less likely to form huge groups
              thisCell.group = targetGroup;
            }
          }
        }
      }
    }); 
  }
  function sequentializeGroups() { // Re-order the group numbers to start at 0, and not skip any numbers
    cells.forEach(thisCell => thisCell.group += 100);
    thisGroup = 0;
    cells.forEach(thisCell => {
      if (thisCell.group >= 100) {
        cells.filter(c => c.group == thisCell.group).forEach(c => c.group = thisGroup);
        thisGroup++;
      }
    });
    groupList = [...Array(thisGroup).keys()];
  }
  logToConsole("Finished assigning groups. Current time is",Date.now()-startTime,"ms.");
  
  // Check for square degeneracies of numbers, i.e two adjacent groups that are like [ 1 , 3 ]
  // This is a quick identifier of multiple solutions                                [ 3 , 1 ]
  for (let x = 0; x < boardSize-1; x++) {
    for (let y = 0; y < boardSize-1; y++) {
      for (let w = 1; w < boardSize-x; w++) {
        for (let h = 1; h < boardSize-y; h++) {
          if ( cells[x  +y*boardSize].value == cells[x+w+(y+h)*boardSize].value
            && cells[x+w+y*boardSize].value == cells[x  +(y+h)*boardSize].value
            && ( ( cells[x+y*boardSize].group == cells[x+w+y*boardSize].group && cells[x+(y+h)*boardSize].group == cells[x+w+(y+h)*boardSize].group ) 
              || ( cells[x+y*boardSize].group == cells[x+(y+h)*boardSize].group && cells[x+w+y*boardSize].group == cells[x+w+(y+h)*boardSize].group ) )
          ) {
            logToConsole(`Square Degen found at these indices: ${x+y*boardSize} ${x+w+(y+h)*boardSize} ${x+w+y*boardSize} ${x+(y+h)*boardSize}`);
            logToConsole("Multiple solutions found in seed",thisSeed)
            logToConsole("Generating another board...");
            logBlankLine();
            return generateBoard(fallbackSeed); // Terminate the current puzzle and generate a completely new puzzle
          }
        }
      }
    }
  }
  
  // Assign the operators to each group
  cellsByGroup = groupList.map(thisGroup => cells.filter(c => c.group == thisGroup)); // Record the cells in each group
  cells.forEach(thisCell => {
    if (thisCell.operator == -1) {
      const thisGroup = thisCell.group;
      const groupSize = cells.filter(c => c.group === thisGroup).length;
      if (groupSize == 1) {
        thisCell.operator = 0;
        thisCell.candidates = [thisCell.value];
      } else {
        tryToAssignOperator();
        function tryToAssignOperator(forceAssignment = 0) {
          const assignChance = 0.1 + forceAssignment;
          if (groupSize == 2) {
            const partner = cells.filter(c => c.group === thisGroup && c != thisCell)[0];
            const divided = (partner.value > thisCell.value ? partner.value / thisCell.value : thisCell.value / partner.value);
            if (divided%1 == 0 && getRandom() < assignChance*(0.5+boardSize/4) && allOperatorsToGive.includes(4)) {
              thisCell.operator = 4; // Set to divide (Chance is boosted because result has to be a whole number)
            } else if (getRandom() < assignChance && allOperatorsToGive.includes(3)) {
              thisCell.operator = 3; // Set to subtract
            }
          } 
          if (thisCell.operator == -1) { // For larger groups, or if smaller groups didn't assign yet
            if (getRandom() < assignChance && allOperatorsToGive.includes(2) // Mult result should be less than 300 (but can be higher if forced)
              && ( cellsByGroup[thisGroup].reduce((total, c) => total * c.value, 1) < 300+1000*forceAssignment || !allOperatorsToGive.includes(1)) ) {
              thisCell.operator = 2; // Set to multiply
            } else if (getRandom() < assignChance+0.05 && allOperatorsToGive.includes(1)) {
              thisCell.operator = 1; // Set to add (Chance is boosted a bit because it comes last)
            }
          }
          if (thisCell.operator == -1) tryToAssignOperator(forceAssignment + 0.1); // Recursively run the function until an operator is assigned
        }
      }
      cells.filter(c => c.group == thisGroup).forEach(c => { // For other cells in same group
        c.operator = thisCell.operator; // Assign operator
        c.result = calcResultForGroup(thisGroup,thisCell.operator); // Determine the equation results
      });
    }
  });
  // Clear all cell values that aren't in a solo group
  cells.filter(thisCell => thisCell.operator != 0).forEach(thisCell => thisCell.value = 0);
  // For a blind puzzle, set all operators to unknown
  if (allOperatorsToGive.includes(5)) cells.filter(thisCell => thisCell.operator != 0).forEach(thisCell => thisCell.operator = 5);
  // Precalculate relations between groups to speed up later steps
  operatorsByGroup = groupList.map(thisGroup => cellsByGroup[thisGroup][0].operator);
  resultByGroup = groupList.map(thisGroup => cellsByGroup[thisGroup][0].result);
  updateCellBorders();

  logToConsole("Starting to generate initial group combos. Current time is",Date.now()-startTime,"ms.");
  combinationsByGroup = groupList.map(thisGroup => generateCombinations(thisGroup)); // Determine unique combinations for each group
  function generateCombinations(thisGroup) { // This function lists valid combos of numbers for cells in that group
    const theseCombos = [];
    const thisResult = resultByGroup[thisGroup];
    const numsToGive = ( operatorsByGroup[thisGroup] == 2 ? allNumsToGive.filter(i => ~~(thisResult/i) == thisResult/i) : allNumsToGive );
    if (operatorsByGroup[thisGroup] == 0) {
      theseCombos.push([thisResult]);
    } else {
      build();
    }
    return theseCombos;
    function build(cellValuesInCombo = []) {
      if (cellValuesInCombo.length === cellsByGroup[thisGroup].length) {
        if (isGroupResultCorrect(thisGroup)) { // If math result matches
          theseCombos.push([...cellValuesInCombo]); // Record as a valid combo for this group
        }
        return;
      }
      if (operatorsByGroup[thisGroup] == 1 
        && ( cellsByGroup[thisGroup].reduce((total, c) => total + (c.value||1), 0) > thisResult
        ||   cellsByGroup[thisGroup].reduce((total, c) => total + (c.value||boardSize), 0) < thisResult ) ) {
        return;
      }
      const thisCell = cellsByGroup[thisGroup][cellValuesInCombo.length];
      numsToGive.forEach(thisNum => { // Try all possible numbers
        if (!thisCell.impactedCells.some(c => c.value == thisNum)) { // Check that there are no dupes in the same line
          thisCell.value = thisNum; // Place the latest value into the actual cell
          build([...cellValuesInCombo,thisNum]); // Continue building a valid combo for this group
        }
      });
      // Clear the cell value, so it doesn't remain once the function has walked back
      thisCell.value = 0;
    }
  }
  logToConsole("Finished generating initial group combos.",
    "\nCurrent time is",Date.now()-startTime,"ms.",
    "\nCombos By Group:",combinationsByGroup);

  // Precalculate relations between groups to speed up later steps
  const groupImpactByGroup = cellsByGroup.map( ( cellsInThisGroup,thisGroup ) => groupList.filter( secGroup => 
    // Input:  [thisGroup]
    // Output: [list of indexes of other groups that are impacted by this group]
    thisGroup != secGroup && cellsByGroup[secGroup].some( secCell => 
      cellsInThisGroup.some( thisCell => thisCell.row == secCell.row || thisCell.col == secCell.col )
    )
  ).sort((a,b) => combinationsByGroup[a].length-combinationsByGroup[b].length));
  const indexesByGroup = cellsByGroup.map(
    // Input:  [thisGroup]
    // Output: [list of indexes of cells in that group] (like cellsByGroup, but index values instead of actual elements)
    cellsInThisGroup => cellsInThisGroup.map(c => c.index)
  );
  const indexesImpactByGroup = cellsByGroup.map( cellsInThisGroup => cellsInThisGroup.map(thisCell =>
    // Input:  [thisGroup][cellOrderInGroup]
    // Output: [list of indexes of cells in other groups which are impacted by this cell]
    thisCell.impactedCells.filter(c => c.group != thisCell.group).map(c => c.index))
  );
  orderToOrderImpact = groupList.map( thisGroup => 
    // Input:  [thisGroup][orderInGroup][secondGroup]
    // Output: [list of orders in second group that are impacted]
    cellsByGroup[thisGroup].map( thisCell =>
      Object.fromEntries(groupImpactByGroup[thisGroup].map( secGroup => [secGroup,
        cellsByGroup[secGroup].map( (secCell,secIndex) =>
          ( thisCell.row == secCell.row || thisCell.col == secCell.col ? secIndex : -1 )
        ).filter( secIndex => secIndex != -1 )
      ]))
    )
  );

  //region Techniques
  // Loop the solver techniques to reduce the possibilities for each cell and each group
  // These are techniques that a human would use to solve a puzzle
  let totalCombinations = combinationsByGroup.reduce((total, theseCombos) => total + theseCombos.length, 0);
  let totalCombinationsPrev = null;
  let techniquesPassCount = 0;
  logToConsole("Starting Techniques.",totalCombinations,"total group combos.\nCurrent time is",Date.now()-startTime,"ms.");
  function getCellCandsFromGroupCombos() { // Get individual cell candidates from the group combos
    groupList.forEach(thisGroup => cellsByGroup[thisGroup].forEach((c,i) =>
      c.candidates = [...new Set(combinationsByGroup[thisGroup].map(thisCombo => thisCombo[i]))].filter(value => c.candidates.includes(value)).sort() ));
  }
  while ( (totalCombinations < totalCombinationsPrev || techniquesPassCount == 0) && totalCombinations > combinationsByGroup.length ) {
    totalCombinationsPrev = totalCombinations;
    // Find candidates for individual cells, based off valid combos for each group
    getCellCandsFromGroupCombos();
    logToConsole("Cell Candidates:",cells.map(c => [...c.candidates]));
    // "Lone Position" Technique: Rows or columns that only have one valid position for a particular number
    for (let row = 0; row < boardSize; row++) {
      for (let thisNum = 1; thisNum < boardSize+1; thisNum++) {
        const cellsWithThatNumber = cellsByRow[row].filter(c => c.candidates.includes(thisNum));
        if (cellsWithThatNumber.length == 0) logToConsole(`Error: No valid spot for ${thisNum} in row ${row}`);
        if (cellsWithThatNumber.length == 1 && cellsWithThatNumber[0].candidates.length > 1) {
          cellsWithThatNumber[0].candidates = [thisNum];
          logToConsole(`Found lone position for ${thisNum} in row ${row}`);
        }
      }
    }
    for (let col = 0; col < boardSize; col++) {
      for (let thisNum = 1; thisNum < boardSize+1; thisNum++) {
        const cellsWithThatNumber = cellsByColumn[col].filter(c => c.candidates.includes(thisNum));
        if (cellsWithThatNumber.length == 0) logToConsole(`Error: No valid spot for ${thisNum} in column ${col}`);
        if (cellsWithThatNumber.length == 1 && cellsWithThatNumber[0].candidates.length > 1) {
          cellsWithThatNumber[0].candidates = [thisNum];
          logToConsole(`Found lone position for ${thisNum} in column ${col}`);
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
    logToConsole("Cell Candidates After Pass:",cells.map(c => [...c.candidates]));
    // Update the valid combos for each group, based on new findings regarding individual candidates
    combinationsByGroup = combinationsByGroup.map( (theseCombos,thisGroup) =>
      theseCombos.filter( thisCombo =>
        thisCombo.every( (thisNum,thisIndex) => cellsByGroup[thisGroup][thisIndex].candidates.includes(thisNum) )
      )
    );
    totalCombinations = combinationsByGroup.reduce((total, theseCombos) => total + theseCombos.length, 0);
    // Report the end of this pass
    logToConsole("Finished Pass",techniquesPassCount=techniquesPassCount+1,"of Techniques.",
      "\nThere are",totalCombinations,"total group combos.",
      "\nCurrent time is",Date.now()-startTime,"ms.",
      "\nCombos By Group:",combinationsByGroup,
      "\nCombo Counts:",[...combinationsByGroup.map(c => c.length)]);
    // "Dead End" Technique: Test each combo and see if it invalidates another group right away
    // This is quite slow, and sometimes not even worth it
    if (totalCombinations == totalCombinationsPrev) { // Only runs as a last resort, if all other techniques found nothing this pass
      logToConsole("Running Dead End technique after Pass",techniquesPassCount);
      // Rather than iterate through combinationsByGroup, it is better to just use groupList, so the combos can be updated during iteration
      groupList.forEach( thisGroup => // Check all groups, regardless of size
        combinationsByGroup[thisGroup] = combinationsByGroup[thisGroup].filter( thisCombo => { // Remove combos which are a dead end
          const isValidCombo = groupImpactByGroup[thisGroup].every( secGroup => // Check all other impacted groups
            combinationsByGroup[secGroup].some( secCombo => // Must have at least one valid combo left in secondary group
              orderToOrderImpact[thisGroup].every( (theseImpacts,thisIndex) => // Every cell in the main group
                // Every impacted index in the secondary group has no conflicts with the main combo
                theseImpacts[secGroup].every( secIndex => thisCombo[thisIndex] != secCombo[secIndex])
              )
            )
          );
          if (!isValidCombo) logToConsole("Found dead end combo",...thisCombo,"in group",thisGroup);
          return isValidCombo;
        })
      );
      totalCombinations = combinationsByGroup.reduce((total, theseCombos) => total + theseCombos.length, 0);
      logToConsole("Finished Dead End Technique after Pass",techniquesPassCount,
        "\nThere are",totalCombinations,"total group combos.",
        "\nCurrent time is",Date.now()-startTime,"ms.",
        "\nCombos By Group:",combinationsByGroup,
        "\nCombo Counts:",[...combinationsByGroup.map(c => c.length)]);
    }
  }
  logToConsole("Finished All Techniques after",techniquesPassCount,"Passes.",
        "\nThere are",totalCombinations,"total group combos.",
        "\nCurrent time is",Date.now()-startTime,"ms.",
        "\nCombos By Group:",combinationsByGroup,
        "\nCells By Group:",cellsByGroup,
        "\nCombo Counts:",[...combinationsByGroup.map(c => c.length)],
        "\nCombo Counts Excess Sum:",totalCombinations - combinationsByGroup.length);
  getCellCandsFromGroupCombos();
  // if (totalCombinations - combinationsByGroup.length > boardSize**3) { // If too much trial and error is required for a human to solve
  //   logToConsole("Board with seed",thisSeed,"is too hard for humans, with",totalCombinations,"combinations.")
  //   logToConsole("Generating another board...");
  //   logBlankLine();
  //   return generateBoard(fallbackSeed); // Terminate the current puzzle and generate a completely new puzzle
  // }

  //region Recursive Solver
  // This is the final recursive search, which solves the puzzle
  // It tests all the combinations of each group, terminating branches which are invalid
  groupList.sort((a,b) => combinationsByGroup[b].length-combinationsByGroup[a].length);
  logToConsole("Starting Final Search. Current time is",Date.now()-startTime,"ms.",
    "\nSorted Group List:",groupList,
    "\nCombos By Sorted Group List:",groupList.map( thisGroup => combinationsByGroup[thisGroup]));
  let totalNodeCount = 0;
  let solutionsFound = [];
  testCombinations(cells.map(c => 0), [...groupList], copyCombos(combinationsByGroup));
  function testCombinations(cellTestValues, remainingGroups, remainingCombosByGroup) {
    if (remainingGroups.length == 0) {
      solutionsFound.push([...cellTestValues]);
      if (solutionsFound.length > 1) failedGeneration = true; // If there is more than one solution, terminate early
      return; // Terminate this branch if all groups have been placed (which means a valid solution)
    }
    if (failedGeneration) return; // Terminate all branches if there are already 2 solutions
    const thisGroup = remainingGroups.pop();
    const indexesInThisGroup = indexesByGroup[thisGroup];
    const indexesByImpactInThisGroup = indexesImpactByGroup[thisGroup];

    combinationsByGroup[thisGroup].forEach( thisCombo => { // Loop through each combo in this group
      // If the group has no valid combos left, this block is skipped, which terminates the branch
      totalNodeCount++; // Track how many nodes have been searched
      // If there are no row or column issues with any of the values in this combo
      if (!thisCombo.some( (value,orderInGroup) => indexesByImpactInThisGroup[orderInGroup].some(i => cellTestValues[i] == value) )) {
        // Place the values of that combo in the cell test values (this is not the actual cells)
        thisCombo.forEach( (value,orderInGroup) => cellTestValues[indexesInThisGroup[orderInGroup]] = value );
        // Prune remaining combos in all other groups that are impacted by this group
        const theseRemainingCombos = copyCombos(remainingCombosByGroup);
        groupImpactByGroup[thisGroup].forEach( secGroup =>
          theseRemainingCombos[secGroup] = theseRemainingCombos[secGroup].filter( secCombo =>
            !orderToOrderImpact[thisGroup].some( (theseImpacts,thisIndex) => // No cell in the combo has an impacted cell with a duplicate
              theseImpacts[secGroup].some( secIndex => thisCombo[thisIndex] == secCombo[secIndex] )
            )
          )
        );
        // logToConsole("Node Count:",totalNodeCount,"- Combo Total:",theseRemainingCombos.reduce((total, c) => total + c.length, 0)," - Combos:",remainingGroups.map(secGroup => theseRemainingCombos[secGroup]));
        remainingGroups.sort((a,b) => theseRemainingCombos[b].length-theseRemainingCombos[a].length);
        testCombinations([...cellTestValues], [...remainingGroups], theseRemainingCombos);
      }
    });
    function seeBoardState() {
      logToConsole('Board State:');
      allIndexes.forEach(row => {
        logToConsole(...cellTestValues.slice(row*boardSize,(row+1)*boardSize).map(i => i||"-"));
      });
    }
  }
  function copyCombos(combosToCopy) { // Creates a deep copy of combos structured like combinationsByGroup
    return [...combosToCopy.map( theseCombos => [...theseCombos.map( thisCombo => [...thisCombo] )] )];
  }

  logToConsole("Finished Final Search.",
    "\nTotal Nodes Searched:",totalNodeCount,
    "\nSolutions Found:",solutionsFound);
  if (failedGeneration) { // If multiple solutions have been found
    logToConsole("Multiple solutions found in seed",thisSeed,"\nGenerating another board...");
    logBlankLine();
    return generateBoard(fallbackSeed); // Terminate the current puzzle and generate a completely new puzzle
  }
  // Log the final output of seed and time, even if logging is disabled
  console.log("Finished puzzle generation of seed",thisSeed,"with a time of",Date.now()-startTime,"ms.");

  cells.forEach(thisCell => {
    thisCell.value = 0; // Hide the cell values
    if (!isDebugMode) thisCell.candidates = []; // Hide candidates
  });
  adjustLayout();
  listOfUndoStates = [];
  saveUndoState();
  updateCellDisplay();
  return { time:Date.now()-startTime, seed:thisSeed }; // Return generation time and seed
}

// region Randomizer
function initializePRNG(forcedSeed = null) { // Mulberry 32 algorithm for RNG
  return function() {
    if (forcedSeed != null) {
      var t = forcedSeed = (forcedSeed + 0x6D2B79F5) >>> 0;
    } else {
      var t = rollingSeed = (rollingSeed + 0x6D2B79F5) >>> 0;
    }
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    // Denominator is max value of an unsigned 32-bit integer
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
function getDailySeed(seedOffset = 7777) { // Get a reliable seed for the day
  if (seedOffset > 9999) console.error("Seed Offset can't be greater than 9999.");
  const d = new Date();                    // seedOffset (up to 9999) specifies board options
  const year = String(d.getYear()).padStart(3,0); // Three digit year (since 1900)
  const month = String(d.getMonth() + 1).padStart(2, '0'); // Months are 0-11
  const day = String(d.getDate()).padStart(2, '0'); // Two digit day of the month
  return parseInt(`${year}${month}${day}${String(seedOffset).slice(-4).padStart(4,0)}`, 10);
}

//region Helper Functions
function calcResultForGroup(thisGroup, forcedOperator = null) {
  const cellsInThisGroup = cellsByGroup[thisGroup];
  const thisOperator = forcedOperator ?? operatorsByGroup[thisGroup];
  if (thisOperator == 0) return cellsInThisGroup[0].value; // If alone, there is no operator
  if (thisOperator == 1) return cellsInThisGroup.reduce((total, c) => total + c.value, 0); // Add
  if (thisOperator == 2) return cellsInThisGroup.reduce((total, c) => total * c.value, 1); // Multiply
  if (thisOperator == 3) return Math.abs(cellsInThisGroup[0].value - cellsInThisGroup[1].value); // Subtract
  if (thisOperator == 4) return Math.max(cellsInThisGroup[0].value, cellsInThisGroup[1].value) / Math.min(cellsInThisGroup[0].value, cellsInThisGroup[1].value); // Divide
}
function isGroupResultCorrect(thisGroup) {
  if (operatorsByGroup[thisGroup] == 5) { // For a blind operator, try all 4 operators
    if (cellsByGroup[thisGroup].length > 2) { // For blind groups larger than 2, only try 2 operators
      return [1,2].some( thisOperator => calcResultForGroup(thisGroup,thisOperator) == resultByGroup[thisGroup] );
    } else {
      return [1,2,3,4].some( thisOperator => calcResultForGroup(thisGroup,thisOperator) == resultByGroup[thisGroup] );
    }
  }
  return ( calcResultForGroup(thisGroup) == resultByGroup[thisGroup] );
}

//region Adjust Layout pen+bor+8 + in+20   64,20,24   64,27,21
window.addEventListener("resize", adjustLayout); // Run on page load and when resizing the window
function adjustLayout() {
  const [height,width] = [document.documentElement.clientHeight,document.documentElement.clientWidth];
  const newIsMobile = (width <= 768);
  // Set dimensions of everything to be integers, to prevent subpixel rounding
  const minFullAxis = Math.min(height,width);
  const inputButtonDimensions = ~~Math.max(40, Math.min(80, minFullAxis*0.1)*boardSize/(boardSize+1));
  document.documentElement.style.setProperty("--input-size", `${inputButtonDimensions}px`);
  const pencilButtonDimensions = ~~Math.min(30,minFullAxis*0.015+8);
  document.documentElement.style.setProperty("--pencil-size", `${pencilButtonDimensions}px`);
  const borderDimensions = ~~(minFullAxis*0.015)+2;
  document.documentElement.style.setProperty("--border-size", `${borderDimensions}px`);
  const viewFillRatioW = Math.max( 0.85, Math.min( 1, 1.35 -  width * 0.0005 )); // Up to 15% w margin on large screens
  const viewFillRatioH = Math.max( 0.91, Math.min( 1, 1.21 - height * 0.0003 )); // Up to  9% h margin on large screens
  const minScreenAxis = Math.min( width * viewFillRatioW,
    (height-inputButtonDimensions-pencilButtonDimensions-3*borderDimensions-28)*viewFillRatioH);
  const totalBorderCount = 2*(boardSize+1);
  const newCellDimensions = Math.max( ~~( (minScreenAxis-totalBorderCount)/(boardSize+0.25) ) - 4, 50);
  // logToConsole(width,cellDimensions,newCellDimensions);
  if (newCellDimensions != cellDimensions || newIsMobile != isMobile) {
    cellDimensions = newCellDimensions;
    isMobile = newIsMobile;
    document.documentElement.style.setProperty("--cell-size", `${cellDimensions}px`);
    document.documentElement.style.setProperty("--row-size", `${cellDimensions+4}px`);
    document.documentElement.style.setProperty("--board-size", `${cellDimensions*boardSize+6*(boardSize-1)}px`);
  logToConsole(cellDimensions,boardSize,cellDimensions*boardSize)
    if ( boardContainer.offsetWidth + 2*(~~(cellDimensions/8)+10) > width) { // Shrink border if overflowing on width
      document.documentElement.style.setProperty("--border-size", `${~~((width - boardContainer.offsetWidth) / 2)}px`);
    }
    inputContainer.innerHTML = "";
    inputButtons = [];
    [...Array(boardSize+1).keys()].forEach( thisNum => {
      const newButton = document.createElement("div");
      newButton.className = "input-button";
      newButton.innerHTML = thisNum || "C";
      newButton.style.backgroundColor = color.cell;
      newButton.addEventListener("click", () => tryToEnterNumber(thisNum));
      inputButtons.push(newButton);
      inputContainer.appendChild(newButton);
    });
    updateCellDisplay();
  }
}
//region Cell Drawing
function updateCellBorders() { // Draw the faint borders between cells in the same group
  cells.forEach((thisCell, i) => {
    thisCell.classList = "cell";
    if (thisCell.row != 0           && cells[i-boardSize].group == thisCell.group) thisCell.classList.add("no-top");
    if (thisCell.row != boardSize-1 && cells[i+boardSize].group == thisCell.group) thisCell.classList.add("no-bot");
    if (thisCell.col != 0           && cells[i-1].group == thisCell.group)         thisCell.classList.add("no-left");
    if (thisCell.col != boardSize-1 && cells[i+1].group == thisCell.group)         thisCell.classList.add("no-right");
    thisCell.isLeader = ( thisCell == cellsByGroup[thisCell.group][0] ); // Only the first cell in each group shows the math symbol
  });
}
function updateCellDisplay(newClickTarget = clickTarget) { // Update the cell display
  // Check if the puzzle is complete, and show the completion animation
  const updatedCompletion = groupList.every(thisGroup => isGroupResultCorrect(thisGroup))
    && cells.every(thisCell => thisCell.value && !thisCell.impactedCells.some(c => c.value == thisCell.value));
  if (updatedCompletion != isPuzzleComplete) {
    isPuzzleComplete = updatedCompletion;
    if (isPuzzleComplete) {
      newClickTarget = null;
      cells.forEach(thisCell => {
        thisCell.classList.add("completion-animation");
        thisCell.style.setProperty("--anim-delay", (thisCell.row + thisCell.col)/boardSize);
      });
      const completionBanner = document.createElement("div");
      completionBanner.className = `completion-banner ${ isMobile ? "thin-shadow" : "thick-shadow" }`;
      completionBanner.innerHTML = "";
      ["Puzzle","Complete!"].forEach((thisPhrase,thisIndex) => {
        if (thisIndex) completionBanner.appendChild(document.createElement("br"));
        [...thisPhrase].forEach((thisChar,animDelay) => {
          const charElement = document.createElement("span");
          charElement.className = "completion-letter";
          charElement.innerHTML = thisChar;
          charElement.style.setProperty("--anim-delay", animDelay + thisIndex*6);
          completionBanner.appendChild(charElement);
        });
      });
      boardContainer.appendChild(completionBanner);
    } else {
      document.getElementsByClassName("completion-banner")[0]?.remove();
      cells.forEach(thisCell => thisCell.classList.remove("completion-animation"));
    }
  }
  // Draw the contents of each cell
  const cellFontSize = ~~Math.min(80, cellDimensions*0.7); // Scale size of the modifier text, max 80px
  const modFontSize  = ~~Math.min(36, cellDimensions/4);   // Scale size of the modifier text, max 36px
  cells.forEach(thisCell => {
    const resultColor = ( cellsByGroup[thisCell.group].some(c => c.value == 0) ? color.black :  // Show mod as black if group is incomplete
                          ( isGroupResultCorrect(thisCell.group) ? color.green : color.red ) ); // Or show as green/red if result is correct/wrong
    const valueColor = ( thisCell.impactedCells.some(c => c.value == thisCell.value) ? color.red : color.black ); // Show value as red is there is a duplicate
    const candFontSize = ~~Math.min(30, modFontSize*0.9, cellDimensions*1.1/thisCell.candidates.length); // Shrink candidates to fit, max 30px
    const modText = ( thisCell.isLeader ? `${thisCell.result} ${opSymbols[thisCell.operator]}` : '' );
    thisCell.innerHTML = `<div class="cell-value" style="color:${valueColor}; font-size:${cellFontSize}px;">${thisCell.value||''}</div>
      <div class="mod-text" style="color:${resultColor}; font-size:${modFontSize}px;">${modText}</div>
      <div class="candidates" style="font-size:${candFontSize}px;">${thisCell.candidates.join(' ')}</div>`;
  });
  updateCellHighlight(newClickTarget);
}
function updateCellHighlight(newClickTarget = clickTarget, isHover = false) { // Update the cell background color
  if (!isHover || !isMobile) {
    if (newClickTarget != clickTarget) {
      tempUndoState = [];
      clickTarget = newClickTarget;
    }
    cells.forEach(thisCell => // Highlight the cell if it is selected
      thisCell.style.backgroundColor = ( clickTarget == thisCell ? ( isPencilMode ? color.yellow : color.purple ) : color.cell )
    );
  }
  inputButtons.forEach( (newButton,thisNum) => { // Set the color of each number input button
    newButton.style.backgroundColor = ( thisNum == 0 ? color.grey : // "Clear" button is always grey
      ( clickTarget == null ? color.cell : // No color if not selected
        ( clickTarget.value ? ( clickTarget.value == thisNum ? color.purple : color.grey ) : // Purple if value is selected
          ( clickTarget.candidates.includes(thisNum) ? color.yellow : // Yellow if in candidate list
            ( clickTarget.impactedCells.some(c => c.value == thisNum) ? color.grey : color.cell ) // Grey if duplicate in line
          )
        )
      )
    );
  });
  updatePencilDisplay();
}
function updatePencilDisplay(isHover = false) {
  pencilContainer.innerHTML = 
    `<div class="pencil-button">${isPencilMode ? "✔" : ""}</div>
    <div class="pencil-text" style="color:${isPencilMode ? color.yellow : ( isHover ? color.purple : color.cell )};">Pencil Mode</div>`;
}
function togglePencilMode() {
  isPencilMode = !isPencilMode;
  updateCellHighlight();
}

//region Event Listeners
document.addEventListener('keydown', (event) => {
  [1,2,3,4,5,6,7,8,9].forEach(thisNum => {
    if (event.key == thisNum && thisNum <= boardSize) {
      tryToEnterNumber(thisNum);
    }
  });
  if (['0','`','Escape','Delete'].includes(event.key)) {
    tryToEnterNumber(0);
  }
  if (event.key == "c") {
    togglePencilMode();
  };
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.key)) {
    if (clickTarget) {
      const thisIndex = clickTarget.index;
      if (event.key == "ArrowUp" && thisIndex >= boardSize) {
        updateCellHighlight(cells[thisIndex-boardSize]);
      } else if (event.key == "ArrowDown" && thisIndex < boardSize*(boardSize-1)) {
        updateCellHighlight(cells[thisIndex+boardSize]);
      } else if (event.key == "ArrowLeft" && thisIndex%boardSize) {
        updateCellHighlight(cells[thisIndex-1]);
      } else if (event.key == "ArrowRight" && thisIndex%boardSize < boardSize-1) {
        updateCellHighlight(cells[thisIndex+1]);
      }
    }
  }
  if (event.key == 'Backspace') { // Undo the last action
    if (listOfUndoStates.length > 1) {
      const stateToRecover = listOfUndoStates[listOfUndoStates.length-2];
      cells.forEach( (thisCell,thisIndex) => {
        thisCell.value = stateToRecover.values[thisIndex];
        thisCell.candidates = [...stateToRecover.candidates[thisIndex]];
      });
      updateCellDisplay(listOfUndoStates.pop().clickTarget);
    }
  };
});
function tryToEnterNumber(thisNum) {
  if (clickTarget) {
    if (isPencilMode) { // Add to the candidate list
      if (thisNum) {
        if (clickTarget.candidates.includes(thisNum)) {
          clickTarget.candidates = clickTarget.candidates.filter(i => i != thisNum);
        } else {
          clickTarget.candidates = [thisNum,...clickTarget.candidates].sort();
        }
      } else {
        clickTarget.candidates = [];
      }
    } else { // Enter the main number
      clickTarget.value = thisNum;
      clickTarget.candidates = [];
      // Save a temporary undo state to recover candidates if multiple values are entered in succession
      if (tempUndoState.length) {
        cells.forEach( (thisCell,thisIndex) => thisCell.candidates = [...tempUndoState[thisIndex]] );
      } else {
        tempUndoState = cells.map(c => c.candidates);
      }
      // Remove that number from the candidate list of impacted cells
      clickTarget.impactedCells.forEach( c => c.candidates = c.candidates.filter( i => i != thisNum ));
    }
    saveUndoState();
    updateCellDisplay();
  }
}
function saveUndoState() {
  listOfUndoStates.push({
    values: cells.map(c => c.value),
    candidates: cells.map(c => c.candidates),
    clickTarget: clickTarget,
  });
}
pencilContainer.addEventListener("click",     () => togglePencilMode());
pencilContainer.addEventListener("mouseover", () => updatePencilDisplay(true));
pencilContainer.addEventListener("mouseout",  () => updatePencilDisplay());