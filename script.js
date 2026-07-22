const boardContainer = document.getElementById("board-container");
const sidebarContainer = document.getElementById("sidebar-container");
const opSymbols = ['','+','×','−','÷'];
let cellsByGroup = [];
let clickTarget = null;
let cells = [];
let boardSize = 4;
const color = { green:'rgb(0, 158, 23)', red:'rgb(204, 33, 0)', black:'rgb(0, 0, 0)' };

const getRandom = initializePRNG(getDailySeed()); // Daily seed
// const getRandom = initializePRNG(Date.now()); // Variable seed
generateBoard(boardSize);

function generateBoard(boardSize, difficultyFactor = 0.5) {
  if (boardSize < 3 || boardSize > 9) {
    console.log("Invalid board size: Must be between 3 and 9.");
    return;
  }

  cells = []; // Clear all cell info
  boardContainer.innerHTML = '';
  let failedGeneration = false;
  assignNumbers();

  function assignNumbers() {
    const allNumsToGive = Array.from({ length: boardSize }, (_, i) => i + 1);
    for (let i = 0; i < boardSize; i++) { // Create each cell in the grid, and assign numbers **************
      const newRow = document.createElement('div'); 
      newRow.className = 'row';
      boardContainer.appendChild(newRow);
      let retryCount = 0;
      for (let j = 0; j < boardSize && retryCount < 1000; j++) {
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
          console.log("Had to retry assigning numbers to row")
          newRow.innerHTML = '';
          while (j > 0) { // Remove all cells in the row
            cells.pop()
            j--;
          }
          j = -1;
          retryCount++;
          continue // Restart the row from column 0
        }
        newCell.value = numsToGive[Math.floor(getRandom() * numsToGive.length)];
        newCell.answer = newCell.value;
        newCell.group = null;
        newCell.candidates = [];
        newCell.isLeader = false;
        newCell.addEventListener('click', () => clickTarget = newCell);
        newRow.appendChild(newCell);
        cells.push(newCell);
      }
    }
  }
  
  console.log(cells);
  assignAllGroups();
  function assignAllGroups() {
    let thisGroup = 100;
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
              if (groupSize < boardSize-1 && getRandom() < mergeChance**(groupSize-2)) { // Less likely to form huge groups
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
          thisIndex%boardSize  != boardSize-1 ? thisIndex+1         : -1  // right
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
              if (groupSize < boardSize-1 && getRandom() < loneMergeChance**(groupSize-2)) { // Less likely to form huge groups
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
    }
    groupList = [...Array(thisGroup).keys()];
  }
  
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
            console.log(`Square Degen found: ${x+y*boardSize} ${x+w+(y+h)*boardSize} ${x+w+y*boardSize} ${x+(y+h)*boardSize}`);
            generateBoard(boardSize); // Generate a completely new puzzle
            return; // Terminate the current puzzle
          }
        }
      }
    }
  }

  // Draw the group borders
  cells.forEach((thisCell, i) => {
    if (thisCell.row != 0           && cells[i-boardSize].group == thisCell.group) thisCell.classList.add("no-top");
    if (thisCell.row != boardSize-1 && cells[i+boardSize].group == thisCell.group) thisCell.classList.add("no-bot");
    if (thisCell.col != 0           && cells[i-1].group == thisCell.group)         thisCell.classList.add("no-left");
    if (thisCell.col != boardSize-1 && cells[i+1].group == thisCell.group)         thisCell.classList.add("no-right");
    cells.filter(c => c.group === thisCell.group)[0].isLeader = true;
  });
  
  // Assign the operators
  cells.forEach(thisCell => {
    if (thisCell.operator == -1) {
      const groupSize = cells.filter(cell => cell.group === thisCell.group).length;
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
        if (getRandom() < 0.6) {
          thisCell.operator = 1; // Set to add
        } else {
          thisCell.operator = 2; // Set to multiply
        }
      }
      cells.forEach(partnerCell => {
        if (partnerCell.group == thisCell.group) partnerCell.operator = thisCell.operator;
      });
    }
  });

  cellsByGroup = groupList.map(thisGroup => cells.filter(c => c.group == thisGroup)); // Record the cells in each group
  cells.forEach(thisCell => thisCell.result = calcResultForCell(thisCell)); // Determine the equation results
  const combinationsByGroup = groupList.map(thisGroup => generateCombinations(thisGroup)); // Determine unique combinations for each group

  function generateCombinations(thisGroup) { // This function lists valid combos of numbers for cells in that group
    const result = [];
    function build(cellValuesInCombo, thisGroup) {
      if (cellValuesInCombo.length === cellsByGroup[thisGroup].length) {
        cells.forEach(thisCell => thisCell.value = -1); // Clear all cell values
        cells.filter(c => cellsByGroup[c.group].length == 1).forEach(c => c.value = c.result); // Fill in the value of lone cells
        cellsByGroup[thisGroup].forEach((thisCell,i) => thisCell.value = cellValuesInCombo[i]); // Place this group's values in the actual cells
        // Terminate if you can't place a number due to the same number (except for -1) in the same row or column
        const nonZeroInGroup = cellsByGroup[thisGroup].filter(c => c.value != -1111);
        if (new Set(nonZeroInGroup.map(c => `${c.value},${c.row}`)).size !== nonZeroInGroup.length) return;
        if (new Set(nonZeroInGroup.map(c => `${c.value},${c.col}`)).size !== nonZeroInGroup.length) return;
        // Add the current cell values only if the math result is correct
        if (calcResultForCell(cellsByGroup[thisGroup][0]) == cellsByGroup[thisGroup][0].result) result.push([...cellValuesInCombo]);
        return;
      }
      for (let i = 1; i <= boardSize; i++) {
        cellValuesInCombo.push(i);
        build(cellValuesInCombo, thisGroup);
        cellValuesInCombo.pop();
      }
    }
    build([], thisGroup);
    return result;
  }

  console.log("Group List:",groupList);
  console.log("Cells By Group:",cellsByGroup);
  console.log("Combos By Group:",combinationsByGroup);
  
  let totalNodeCount = 0;
  solutionsFound = [];
  groupList.sort((a,b) => combinationsByGroup[b].length-combinationsByGroup[a].length);
  console.log("Sorted Group List:",groupList);
  // Test all the combinations of each group, to find how many solutions there are
  testCombinations(cells.map(c => 0), [...groupList])
  function testCombinations(cellTestValues, groupTestList) {
    if (groupTestList.length == 0) {
      solutionsFound.push(cellTestValues);
      if (solutionsFound.length > 1) failedGeneration = true; // If there is more than one solution, terminate early
      return; // Terminate this branch if all groups have been placed (which means a valid solution)
    }
    if (failedGeneration) return; // Terminate all branches if there are already 2 solutions
    const thisGroup = groupTestList.pop();
    combinationsByGroup[thisGroup].forEach( thisCombo => { // Loop through each combo for a group
      thisCombo.forEach( (value, index) => { // Place the values of that combo in the related cells
        cellTestValues[cellsByGroup[thisGroup][index].index] = value;
      });
      updateCellDisplay();
      totalNodeCount++; // Track how many nodes have been searched
      // Encode the cellTestValues as value and row (or column), to check for invalid numbers
      // Values of zero are replaced with large values, as to not count as duplicates
      if ( new Set(cellTestValues.map((v,i) => `${v||(i+1)*20},${~~(i%boardSize)}`)).size == cellTestValues.length
        && new Set(cellTestValues.map((v,i) => `${v||(i+1)*20},${~~(i/boardSize)}`)).size == cellTestValues.length) { // If there are no row or column issues
        testCombinations([...cellTestValues], [...groupTestList]); // Call the function for the next group
      }
    });
  }
  console.log("Total Nodes Searched:",totalNodeCount);
  console.log(solutionsFound);

  if (failedGeneration) {
    generateBoard(boardSize);
  }
  
  cells.forEach(thisCell => {
    thisCell.value = 0; // Hide the cell values
    thisCell.addEventListener('mouseover', () => clickTarget = thisCell);
    // thisCell.candidates = [];
  });
  updateCellDisplay();
}

function initializePRNG(seed) { // Mulberry 32 algorithm for RNG
  return function() {
    var t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
function getDailySeed() { // Get a reliable seed for the day (e.g., 20260720)
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0'); // Months are 0-11
  const day = String(d.getDate()).padStart(2, '0');
  return parseInt(`${year}${month}${day}77`, 10);
}

function calcResultForCell(thisCell) {
  const cellsInThisGroup = cellsByGroup[thisCell.group];
  if (thisCell.operator == 0) return thisCell.value; // If alone, there is no operator
  if (thisCell.operator == 1) return cellsInThisGroup.reduce((total, c) => total + c.value, 0); // Add
  if (thisCell.operator == 2) return cellsInThisGroup.reduce((total, c) => total * c.value, 1); // Multiply
  if (thisCell.operator == 3) return Math.abs(cellsInThisGroup[0].value - cellsInThisGroup[1].value); // Subtract
  if (thisCell.operator == 4) return ( cellsInThisGroup[0].value > cellsInThisGroup[1].value ? // Divide
    ( cellsInThisGroup[0].value / cellsInThisGroup[1].value ) : 
    ( cellsInThisGroup[1].value / cellsInThisGroup[0].value ) );
}

function updateCellDisplay() { // Update the cell display
  cells.forEach(thisCell => {
    const allFull = cellsByGroup[thisCell.group].every(c => c.value > 0);
    const resultColor = ( allFull ? ( calcResultForCell(thisCell) == thisCell.result ? color.green : color.red ) : color.black );
    const valueColor = ( cells.some(c => c.value == thisCell.value && ((c.row == thisCell.row) != (c.col == thisCell.col))) ? color.red : color.black );
    thisCell.innerHTML = `<div class="cell-value" style="color:${valueColor}">${thisCell.value ? thisCell.value : ''}</div>
      <div class="mod-text" style="color:${resultColor}">${thisCell.isLeader ? thisCell.result : ''} ${thisCell.isLeader ? opSymbols[thisCell.operator] : ''}</div>
      <div class="candidates">${thisCell.candidates.join(' ')}</div>`;
  });
}

document.addEventListener('keydown', (event) => {
  [1,2,3,4,5,6,7,8,9].forEach(number => {
    if (event.key == number && number <= boardSize && clickTarget) {
      clickTarget.value = number;
    }
  });
  if (['0','`','Escape','Backspace','Delete'].includes(event.key)) {
    clickTarget.value = 0; // Clear the cell's value
  }
  updateCellDisplay();
});