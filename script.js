document.addEventListener('DOMContentLoaded', () => {
    const gridContainer = document.getElementById('backpack-grid-container');
    const grid = document.getElementById('backpack-grid');
    const itemSource = document.getElementById('item-source');
    const sourceItems = document.querySelectorAll('#item-source .item');

    const GRID_COLS = 5;
    const GRID_ROWS = 4;
    const CELL_SIZE = 50;
    const GAP = 2;

    // --- State ---
    // backpackState[row][col] = itemElement or null
    let backpackState = Array(GRID_ROWS).fill(null).map(() => Array(GRID_COLS).fill(null));
    // 配置されているアイテム要素のリスト (管理用)
    let placedItems = [];

    // --- 操作状態管理 ---
    let activeItem = null;      // 現在操作中のアイテム要素 (元の要素 or クローン)
    let sourceElement = null;   // 操作の元となった要素 (ソース or グリッド内のアイテム)
    let ghostItem = null;       // タッチ操作時のゴースト
    let isDragging = false;     // マウスドラッグ中フラグ
    let isTouching = false;     // タッチ操作中フラグ
    let dragMoved = false;      // 移動したかどうかのフラグ (タップ判定用)
    let startX, startY, offsetX, offsetY, lastTouchX, lastTouchY; // 座標変数
    let originalGridPos = null; // グリッドから移動開始した場合の元の位置 {row, col}

    // --- 初期化 ---
    function initializeGrid() {
        console.log("Initializing grid...");
        grid.innerHTML = ''; // グリッドをクリア
        grid.style.setProperty('--grid-cols', GRID_COLS);
        grid.style.setProperty('--grid-rows', GRID_ROWS);
        gridContainer.style.width = `${GRID_COLS * (CELL_SIZE + GAP) + GAP}px`;
        gridContainer.style.height = `${GRID_ROWS * (CELL_SIZE + GAP) + GAP}px`; // 高さも設定

        backpackState = Array(GRID_ROWS).fill(null).map(() => Array(GRID_COLS).fill(null));
        placedItems = [];

        for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
                const cell = document.createElement('div');
                cell.classList.add('grid-cell');
                cell.dataset.row = r;
                cell.dataset.col = c;
                grid.appendChild(cell);
            }
        }
        console.log(`Grid initialized (${GRID_COLS}x${GRID_ROWS})`);
    }

    // --- アイテム配置関連 ---
    function canPlaceItem(itemElement, targetRow, targetCol) {
        if (!itemElement) return false;
        const w = parseInt(itemElement.dataset.w);
        const h = parseInt(itemElement.dataset.h);

        if (isNaN(targetRow) || isNaN(targetCol)) return false; // 座標が無効

        for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
                const checkRow = targetRow + r;
                const checkCol = targetCol + c;
                // 範囲外チェック
                if (checkRow < 0 || checkRow >= GRID_ROWS || checkCol < 0 || checkCol >= GRID_COLS) {
                    // console.log(`Placement check failed: Out of bounds at R${checkRow}, C${checkCol}`);
                    return false;
                }
                // 衝突チェック (自分自身との衝突は許可)
                const occupyingElement = backpackState[checkRow][checkCol];
                if (occupyingElement !== null && occupyingElement !== itemElement) {
                    // console.log(`Placement check failed: Collision at R${checkRow}, C${checkCol} with ${occupyingElement.dataset.name}`);
                    return false;
                }
            }
        }
        // console.log(`Placement check success for ${itemElement.dataset.name} at R${targetRow}, C${targetCol}`);
        return true;
    }

    function placeItem(itemElement, targetRow, targetCol, isInitialPlacement = false) {
        if (!itemElement || isNaN(targetRow) || isNaN(targetCol)) {
            console.error("placeItem: Invalid arguments", itemElement, targetRow, targetCol);
            return;
        }
        const w = parseInt(itemElement.dataset.w);
        const h = parseInt(itemElement.dataset.h);
        const rotation = parseInt(itemElement.dataset.rotated || '0');

        console.log(`Placing ${itemElement.dataset.name} (${w}x${h}) at R${targetRow}, C${targetCol}`);

        // 1. 古い位置情報をStateから削除 (移動の場合)
        removeItemFromState(itemElement);

        // 2. 新しい位置情報をStateに登録
        itemElement.dataset.row = targetRow;
        itemElement.dataset.col = targetCol;
        for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
                backpackState[targetRow + r][targetCol + c] = itemElement;
            }
        }
        // 配置済みリストに追加 (まだなければ)
        if (!placedItems.includes(itemElement)) {
            placedItems.push(itemElement);
        }

        // 3. DOM要素のスタイル設定とグリッドへの追加
        itemElement.style.position = 'absolute';
        itemElement.style.left = `${targetCol * (CELL_SIZE + GAP)}px`;
        itemElement.style.top = `${targetRow * (CELL_SIZE + GAP)}px`;
        itemElement.style.width = `${w * CELL_SIZE + (w - 1) * GAP}px`;
        itemElement.style.height = `${h * CELL_SIZE + (h - 1) * GAP}px`;
        itemElement.style.transform = `rotate(${rotation}deg)`;
        itemElement.style.pointerEvents = 'auto'; // イベントを受け付けるように
        itemElement.classList.remove('dragging', 'touch-ghost'); // スタイル解除
        itemElement.style.opacity = '1';
        itemElement.style.visibility = 'visible'; // 念のため表示

        // グリッドに要素を追加 (まだ親要素がグリッドでない場合)
        if (itemElement.parentElement !== grid) {
             grid.appendChild(itemElement);
             console.log(`${itemElement.dataset.name} appended to grid DOM.`);
        }

        // 4. イベントリスナーと回転ボタンの設定 (関数化)
        setupItemInteractions(itemElement);

        // console.log("Current State:", backpackState.map(row => row.map(cell => cell ? cell.dataset.name : null)));
        // console.log("Placed items:", placedItems.map(item => item.dataset.name));
    }

    function removeItemFromState(itemElement) {
        if (!itemElement) return;
        // console.log(`Removing ${itemElement.dataset.name} from state`);
        let removed = false;
        for (let r = 0; r < GRID_ROWS; r++) {
            for (let c = 0; c < GRID_COLS; c++) {
                if (backpackState[r][c] === itemElement) {
                    backpackState[r][c] = null;
                    removed = true;
                }
            }
        }
        // 配置済みリストからも削除 (DOMから消える場合の前処理など)
        const index = placedItems.indexOf(itemElement);
        if (index > -1) {
            placedItems.splice(index, 1);
            // console.log(`${itemElement.dataset.name} removed from placedItems list`);
        }
        // return removed; // 必要なら削除したか返す
    }

    function setupItemInteractions(itemElement) {
        // 既存リスナーを削除（重複防止のため推奨されるが、複雑化するので今回は省略）
        // itemElement.removeEventListener('dragstart', handleDragStart);
        // ...

        itemElement.draggable = true;
        itemElement.addEventListener('dragstart', handleDragStart);
        itemElement.addEventListener('dragend', handleDragEnd);
        itemElement.addEventListener('touchstart', handleTouchStart, { passive: false });
        itemElement.addEventListener('touchmove', handleTouchMove, { passive: false });
        itemElement.addEventListener('touchend', handleTouchEnd);
        itemElement.addEventListener('click', handleClick); // タップ/クリックで回転ボタン表示

        // 回転ボタン
        let rotateBtn = itemElement.querySelector('.rotate-button');
        if (!rotateBtn) {
            rotateBtn = document.createElement('button');
            rotateBtn.classList.add('rotate-button');
            rotateBtn.innerHTML = '↻';
            itemElement.appendChild(rotateBtn);
            // console.log(`Rotate button added to ${itemElement.dataset.name}`);
        }
        // 回転ボタンには専用のクリック/タップハンドラを設定
        rotateBtn.removeEventListener('click', handleRotateClick); // 重複防止
        rotateBtn.addEventListener('click', handleRotateClick);
        // ボタン上でのドラッグ/タッチ開始を防ぐ
        rotateBtn.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: false });
        rotateBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    // --- 回転処理 ---
    function handleRotateClick(e) {
        e.stopPropagation(); // アイテムへのクリック伝播を防ぐ
        const itemElement = e.target.closest('.item');
        if (!itemElement || !grid.contains(itemElement)) return;
        console.log(`Rotate button clicked for ${itemElement.dataset.name}`);
        rotateItem(itemElement);
    }

    function rotateItem(itemElement) {
        const currentW = parseInt(itemElement.dataset.w);
        const currentH = parseInt(itemElement.dataset.h);
        const currentRow = parseInt(itemElement.dataset.row);
        const currentCol = parseInt(itemElement.dataset.col);
        const currentRotation = parseInt(itemElement.dataset.rotated || '0');

        const newW = currentH;
        const newH = currentW;
        const newRotation = (currentRotation + 90) % 360;

        console.log(`Attempting rotate: ${itemElement.dataset.name} to ${newW}x${newH}`);

        // 一時的にStateから削除してチェック
        removeItemFromState(itemElement);
        // 回転後の配置チェック（自分自身を除いてチェックされる）
        if (canPlaceItem(itemElement, currentRow, currentCol)) {
            // 回転可能ならデータ属性とスタイル更新
            itemElement.dataset.w = newW;
            itemElement.dataset.h = newH;
            itemElement.dataset.rotated = newRotation;
            // 再配置してStateとスタイルを確定
            placeItem(itemElement, currentRow, currentCol);
            console.log(`Rotated ${itemElement.dataset.name}. New size ${newW}x${newH}, Rot ${newRotation}deg`);
        } else {
            // 回転不可なら元の状態に戻す
            console.warn("Cannot rotate item here.");
            // 元のサイズと回転に戻す
            itemElement.dataset.w = currentW; // データ属性を戻す
            itemElement.dataset.h = currentH;
            itemElement.dataset.rotated = currentRotation;
            // 再配置してStateとスタイルを元に戻す
            placeItem(itemElement, currentRow, currentCol);
        }
         // 回転後はボタン非表示にする（任意）
         itemElement.classList.remove('show-rotate');
    }


    // --- イベントハンドラ ---

    // (ドラッグ/タッチ) 開始処理
    function startAction(e) {
        if (isDragging || isTouching) return; // 既に操作中の場合は無視

        const targetItem = e.target.closest('.item');
        if (!targetItem) return; // アイテム以外で開始しない

        // 回転ボタンでの開始は無視（専用ハンドラで処理）
        if (e.target.classList.contains('rotate-button')) return;

        activeItem = targetItem; // 操作対象アイテム
        sourceElement = targetItem; // 元の要素を記憶
        dragMoved = false;

        const isTouchEvent = e.type.startsWith('touch');
        const clientX = isTouchEvent ? e.touches[0].clientX : e.clientX;
        const clientY = isTouchEvent ? e.touches[0].clientY : e.clientY;

        const rect = activeItem.getBoundingClientRect();
        offsetX = clientX - rect.left;
        offsetY = clientY - rect.top;
        startX = clientX;
        startY = clientY;

        if (isTouchEvent) {
            isTouching = true;
            e.preventDefault(); // スクロール防止
            lastTouchX = clientX;
            lastTouchY = clientY;
            // タッチ用のゴースト作成
            ghostItem = activeItem.cloneNode(true);
            ghostItem.classList.add('touch-ghost');
            ghostItem.style.visibility = 'hidden'; // 移動開始まで非表示
            document.body.appendChild(ghostItem);
            console.log("Touch Start:", activeItem.dataset.name);
        } else {
            isDragging = true;
            e.dataTransfer.effectAllowed = 'move';
             // e.dataTransfer.setData('text/plain', activeItem.id); // 必要なら
             // ゴースト非表示（任意）
             // try { e.dataTransfer.setDragImage(new Image(), 0, 0); } catch (error) {}
             // 遅延してスタイル適用
             setTimeout(() => {
                 if (activeItem) activeItem.classList.add('dragging');
             }, 0);
            console.log("Drag Start:", activeItem.dataset.name);
        }

        // グリッドからの移動の場合、元の位置を記憶し、Stateから一時削除
        if (grid.contains(activeItem)) {
            originalGridPos = { row: parseInt(activeItem.dataset.row), col: parseInt(activeItem.dataset.col) };
            removeItemFromState(activeItem);
            console.log(`Moving from grid: ${activeItem.dataset.name} at R${originalGridPos.row}, C${originalGridPos.col}`);
        } else {
            originalGridPos = null; // ソースからの場合はnull
             // ソースアイテムの場合はクローンを操作対象にする
             if (itemSource.contains(activeItem)) {
                 const clone = activeItem.cloneNode(true);
                 // setupItemInteractions(clone); // 配置時に設定するのでここでは不要
                 activeItem = clone; // 操作対象をクローンに切り替え
                 sourceElement.style.opacity = '0.5'; // 元アイテムを半透明に
                 console.log(`Cloned ${activeItem.dataset.name} from source for dragging.`);
             }
        }
    }

    // (ドラッグ/タッチ) 移動処理
    function moveAction(e) {
        if (!isDragging && !isTouching) return;

        const isTouchEvent = e.type.startsWith('touch');
        if (isTouchEvent) e.preventDefault(); // スクロール防止

        const clientX = isTouchEvent ? e.touches[0].clientX : e.clientX;
        const clientY = isTouchEvent ? e.touches[0].clientY : e.clientY;

        // 移動したか判定
        if (!dragMoved && (Math.abs(clientX - startX) > 5 || Math.abs(clientY - startY) > 5)) {
            dragMoved = true;
            if (isTouching && ghostItem) {
                ghostItem.style.visibility = 'visible'; // ゴースト表示
                if(sourceElement && grid.contains(sourceElement)) sourceElement.style.opacity = '0.5'; // グリッドの元アイテムを半透明に
                else if (sourceElement && itemSource.contains(sourceElement)) {} // ソースの元アイテムは半透明のまま
            }
            console.log("Movement detected.");
        }

        // ゴースト/アイテムを追従
        const elementToMove = isTouching ? ghostItem : activeItem;
        if (elementToMove) {
            elementToMove.style.left = `${clientX - offsetX}px`;
            elementToMove.style.top = `${clientY - offsetY}px`;
             // ドラッグ中はfixedにする方が良い場合も
             if (!isTouchEvent && isDragging) {
                 elementToMove.style.position = 'fixed'; // ドラッグ中はfixedにして画面追従
                 elementToMove.style.zIndex = 1000;
             }
        }

        // グリッド上の座標取得とフィードバック
        const { row, col } = getGridCoords(clientX, clientY);
        if (isOverGrid(clientX, clientY)) {
             highlightDropzone(activeItem, row, col); // 配置可能かハイライト
        } else {
             clearDropzoneHighlight();
        }

        if (isTouchEvent) {
            lastTouchX = clientX;
            lastTouchY = clientY;
        }
    }

    // (ドラッグ/タッチ) 終了処理
    function endAction(e) {
        if (!isDragging && !isTouching) return;

        const isTouchEvent = e.type.startsWith('touch');
        // console.log(isTouchEvent ? "Touch End" : "Drag End");

        clearDropzoneHighlight();

        // ゴースト削除
        if (isTouching && ghostItem) {
            ghostItem.remove();
            ghostItem = null;
        }

        // 元アイテムのスタイル戻し (ソース or グリッド)
        if (sourceElement) {
             sourceElement.style.opacity = '1';
             sourceElement.classList.remove('dragging'); // ドラッグクラスも消す
        }
        // activeItem (クローンかもしれない) のスタイルも戻す準備
        if (activeItem) {
             activeItem.classList.remove('dragging');
             activeItem.style.position = 'absolute'; // 絶対配置に戻す
        }


        // --- 配置判定 ---
        let placedSuccessfully = false;
        if (dragMoved) { // 移動があった場合のみ配置判定
            const clientX = isTouchEvent ? lastTouchX : e.clientX;
            const clientY = isTouchEvent ? lastTouchY : e.clientY;

            if (isOverGrid(clientX, clientY)) {
                const { row, col } = getGridCoords(clientX, clientY);
                // console.log(`Attempting drop at R${row}, C${col}`);
                if (canPlaceItem(activeItem, row, col)) {
                    placeItem(activeItem, row, col); // 配置実行
                    placedSuccessfully = true;
                    console.log(`Placement success: ${activeItem.dataset.name}`);
                    // ソースからのクローン配置成功時は sourceElement の参照を null にしても良いかも
                } else {
                    console.warn("Placement failed: Collision or invalid position.");
                }
            } else {
                console.warn("Placement failed: Dropped outside grid.");
            }
        } else if (!isTouchEvent) { // マウスで移動なしクリックの場合
            handleClick(e); // 通常のクリック処理へ
        } else { // タッチで移動なし（タップ）の場合
            handleClick(e); // タップ処理 (回転ボタン表示など)
        }


        // --- 後処理 ---
        if (dragMoved && !placedSuccessfully) {
            console.log("Handling placement failure...");
            // 配置失敗時の処理
            if (originalGridPos !== null && sourceElement && grid.contains(sourceElement)) {
                // グリッドから移動して失敗 -> 元の位置に戻す試み
                console.log(`Attempting to return ${sourceElement.dataset.name} to R${originalGridPos.row}, C${originalGridPos.col}`);
                // 元の位置に配置可能かチェック (他のアイテムが置かれていなければ)
                 if (canPlaceItem(sourceElement, originalGridPos.row, originalGridPos.col)) {
                     placeItem(sourceElement, originalGridPos.row, originalGridPos.col);
                     console.log("Returned item to original grid position.");
                 } else {
                     console.warn("Original position occupied, removing item.");
                     sourceElement.remove(); // 戻せない場合は削除
                 }

            } else if (sourceElement && itemSource.contains(sourceElement)) {
                // ソースから移動して失敗 -> クローン(activeItem)を削除
                 if(activeItem !== sourceElement) activeItem.remove(); // クローンを削除
                 console.log("Removed unused clone from source drag.");
                 sourceElement.style.opacity = '1'; // 元アイテムは透明度戻す
            } else {
                 // その他の場合（原因不明など）は操作中のアイテムを削除？
                 if (activeItem) activeItem.remove();
            }
        }

        // 状態リセット
        isDragging = false;
        isTouching = false;
        activeItem = null;
        sourceElement = null;
        ghostItem = null;
        originalGridPos = null;
        dragMoved = false;

         // 回転ボタンを非表示にする（任意）
         document.querySelectorAll('.item.show-rotate').forEach(item => {
             // 今回はタップ時に表示なので、ここでは消さない方が自然かも
             // item.classList.remove('show-rotate');
         });

         console.log("Action End.");
    }

    // アイテムクリック/タップ処理 (移動なしの場合)
    function handleClick(e) {
         // 回転ボタンのクリックは専用ハンドラで処理済みのはず
        if (e.target.classList.contains('rotate-button')) return;

        const clickedItem = e.currentTarget; // イベントが設定された要素
        console.log(`Click/Tap on: ${clickedItem.dataset.name}`);

        // グリッド内のアイテムでなければ何もしない
        if (!grid.contains(clickedItem)) return;

        // 他のアイテムの回転ボタンを非表示に
        document.querySelectorAll('.item.show-rotate').forEach(item => {
            if (item !== clickedItem) {
                item.classList.remove('show-rotate');
            }
        });
        // クリックしたアイテムの回転ボタン表示/非表示をトグル
        clickedItem.classList.toggle('show-rotate');
        console.log(`Toggled rotate button for ${clickedItem.dataset.name}`);
    }


    // --- グリッドコンテナへのイベント (Drag and Drop API用) ---
    gridContainer.addEventListener('dragover', (e) => {
        e.preventDefault(); // ドロップを許可
        // moveAction 内でハイライト処理は行われる
    });

    gridContainer.addEventListener('dragleave', (e) => {
        clearDropzoneHighlight(); // ドラッグが外れたらハイライト解除
    });

    gridContainer.addEventListener('drop', (e) => {
        e.preventDefault(); // デフォルト処理（例: リンクを開く）をキャンセル
        // endAction でドロップ処理を行うので、ここでは何もしなくても良い
        // （ただし、dragend より先に drop が発生するので注意が必要）
        // endAction をここで呼び出す設計も可能
        // handleDragEnd(e); // DragEnd相当の処理をここでトリガーする？
    });

    // --- 補助関数 ---
    function getGridCoords(clientX, clientY) {
        const gridRect = grid.getBoundingClientRect();
        const x = clientX - gridRect.left;
        const y = clientY - gridRect.top;
        // グリッド範囲外の場合も考慮しつつ、最も近いセルを計算（マイナスにならないように）
        const col = Math.max(0, Math.min(GRID_COLS - 1, Math.floor(x / (CELL_SIZE + GAP))));
        const row = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor(y / (CELL_SIZE + GAP))));
        return { row, col };
    }

    function isOverGrid(clientX, clientY) {
        const gridRect = grid.getBoundingClientRect();
        return clientX >= gridRect.left && clientX <= gridRect.right &&
               clientY >= gridRect.top && clientY <= gridRect.bottom;
    }

    function highlightDropzone(itemElement, targetRow, targetCol) {
        clearDropzoneHighlight();
        if (!itemElement || isNaN(targetRow) || isNaN(targetCol)) return;

        const w = parseInt(itemElement.dataset.w);
        const h = parseInt(itemElement.dataset.h);
        const canPlace = canPlaceItem(itemElement, targetRow, targetCol);

        for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
                const checkRow = targetRow + r;
                const checkCol = targetCol + c;
                const cell = grid.querySelector(`.grid-cell[data-row="${checkRow}"][data-col="${checkCol}"]`);
                if (cell) {
                    cell.style.backgroundColor = canPlace ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
                    cell.classList.add('dropzone-highlight');
                }
            }
        }
    }

    function clearDropzoneHighlight() {
        grid.querySelectorAll('.grid-cell.dropzone-highlight').forEach(cell => {
            cell.style.backgroundColor = '';
            cell.classList.remove('dropzone-highlight');
        });
    }

    // --- 初期設定 ---
    initializeGrid(); // グリッド初期化

    // ソースアイテムへのイベントリスナー設定
    sourceItems.forEach(item => {
        // データ属性にサイズがない場合はデフォルト1x1を設定（念のため）
        if (!item.dataset.w) item.dataset.w = 1;
        if (!item.dataset.h) item.dataset.h = 1;

        item.draggable = true;
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd); // dragend も必要
        item.addEventListener('touchstart', handleTouchStart, { passive: false });
        // move/end は document or body で listen する方が安定する場合もあるが、一旦要素に設定
        item.addEventListener('touchmove', handleTouchMove, { passive: false });
        item.addEventListener('touchend', handleTouchEnd);
         // ソースアイテムはクリック不要
         // item.addEventListener('click', handleClick);
    });

    // マウス移動とタッチ移動はウィンドウ全体で監視する方が安定する場合がある
    // document.addEventListener('mousemove', moveAction);
    // document.addEventListener('touchmove', moveAction, { passive: false });
    // document.addEventListener('mouseup', endAction);
    // document.addEventListener('touchend', endAction);
    // 上記のように全体で監視する場合、startActionでリスナーを追加し、endActionで削除するなどの工夫が必要

}); // End DOMContentLoaded