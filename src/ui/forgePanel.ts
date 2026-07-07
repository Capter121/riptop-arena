import { globalInventory } from '../data/inventoryManager';
import { RecipesManager, BASE_COMPONENTS, type Recipe } from '../data/recipes';

export class ForgePanel {
  public readonly root: HTMLElement;
  private sidebarList: HTMLElement;
  private treeContainer: HTMLElement;
  private actionContainer: HTMLElement;
  private forgeButton: HTMLButtonElement;
  private closeButton: HTMLButtonElement;
  
  private flashOverlay: HTMLElement;
  
  private selectedRecipe: Recipe | null = null;
  private isForging = false;
  private availableCrafts: { recipe: Recipe, consumeIds: string[] }[] = [];

  private onGetUnlocked: () => Set<string>;
  private onUnlock: (id: string) => void;

  constructor(
    onGetUnlocked: () => Set<string>,
    onUnlock: (id: string) => void
  ) {
    this.onGetUnlocked = onGetUnlocked;
    this.onUnlock = onUnlock;
    this.root = document.createElement('div');
    this.root.className = 'forge-panel';
    this.root.style.display = 'none';
    
    const header = document.createElement('div');
    header.className = 'forge-panel__header';
    header.innerHTML = '<h2>神级图纸熔炉 (Forge)</h2>';
    this.closeButton = document.createElement('button');
    this.closeButton.className = 'forge-panel__close';
    this.closeButton.textContent = '✕';
    this.closeButton.addEventListener('click', () => this.close());
    header.appendChild(this.closeButton);

    const body = document.createElement('div');
    body.className = 'forge-layout';

    const sidebar = document.createElement('div');
    sidebar.className = 'forge-sidebar';
    sidebar.innerHTML = '<h3>装备图纸</h3>';
    this.sidebarList = document.createElement('div');
    this.sidebarList.className = 'forge-sidebar__list';
    sidebar.appendChild(this.sidebarList);

    const mainArea = document.createElement('div');
    mainArea.className = 'forge-main';
    
    this.treeContainer = document.createElement('div');
    this.treeContainer.className = 'forge-tree-container';
    
    this.actionContainer = document.createElement('div');
    this.actionContainer.className = 'forge-action-container';
    
    this.forgeButton = document.createElement('button');
    this.forgeButton.className = 'forge-btn-craft';
    this.forgeButton.innerHTML = '一键熔炼<div class="forge-btn-glow"></div>';
    this.forgeButton.addEventListener('click', () => this.onForge());
    this.actionContainer.appendChild(this.forgeButton);

    mainArea.append(this.treeContainer, this.actionContainer);
    body.append(sidebar, mainArea);
    
    this.flashOverlay = document.createElement('div');
    this.flashOverlay.className = 'flash-overlay';
    
    this.root.append(header, body, this.flashOverlay);

    globalInventory.subscribe(() => {
      if(this.isForging) return;
      this.refreshState();
    });
  }

  private refreshState() {
    const items = globalInventory.getItems();
    this.availableCrafts = RecipesManager.getAvailableCrafts(items);
    this.renderSidebar();
    if (this.selectedRecipe) {
      this.renderTreeView(this.selectedRecipe);
    } else {
      this.treeContainer.innerHTML = '<div class="forge-empty">请在左侧选择图纸</div>';
      this.forgeButton.disabled = true;
      this.forgeButton.classList.remove('ready');
      this.forgeButton.textContent = '请选择配方';
    }
  }

  private renderSidebar() {
    this.sidebarList.innerHTML = '';
    const allRecipes = RecipesManager.getAllRecipes();
    const unlockedSet = this.onGetUnlocked();
    
    const sortedRecipes = [...allRecipes].sort((a, b) => {
      const aAvail = this.availableCrafts.some(c => c.recipe === a);
      const bAvail = this.availableCrafts.some(c => c.recipe === b);
      if (aAvail && !bAvail) return -1;
      if (!aAvail && bAvail) return 1;
      const aUnlock = unlockedSet.has(a.resultId);
      const bUnlock = unlockedSet.has(b.resultId);
      if (aUnlock && !bUnlock) return -1;
      if (!aUnlock && bUnlock) return 1;
      return 0;
    });

    for (const recipe of sortedRecipes) {
      const base = BASE_COMPONENTS[recipe.resultId];
      if (!base) continue;
      const isUnlocked = unlockedSet.has(recipe.resultId);
      const isAvailable = this.availableCrafts.some(c => c.recipe === recipe);
      
      const itemEl = document.createElement('div');
      itemEl.className = `forge-list-item ${isUnlocked ? '' : 'locked'} ${isAvailable ? 'available' : ''}`;
      if (this.selectedRecipe === recipe) {
        itemEl.classList.add('selected');
      }

      itemEl.innerHTML = `
        <div class="forge-list-item__icon">${isUnlocked ? base.name.substring(0, 1) : '?'}</div>
        <div class="forge-list-item__name">${isUnlocked ? base.name : '未知神装'}</div>
        ${isAvailable ? '<div class="forge-list-item__badge">可合成</div>' : ''}
      `;

      itemEl.addEventListener('click', () => {
        this.selectedRecipe = recipe;
        this.refreshState();
      });

      this.sidebarList.appendChild(itemEl);
    }
  }

  private renderTreeView(recipe: Recipe) {
    this.treeContainer.innerHTML = '';
    const base = BASE_COMPONENTS[recipe.resultId];
    if (!base) return;
    
    const unlockedSet = this.onGetUnlocked();
    const isUnlocked = unlockedSet.has(recipe.resultId);
    
    const tree = document.createElement('div');
    tree.className = 'recipe-tree';
    
    const rootNode = document.createElement('div');
    rootNode.className = `tree-node tree-node--root ${isUnlocked ? '' : 'locked'}`;
    rootNode.innerHTML = `
      <div class="tree-node__icon">${isUnlocked ? base.name.substring(0, 1) : '?'}</div>
      <div class="tree-node__name">${isUnlocked ? base.name : '未知神装'}</div>
    `;
    
    const branches = document.createElement('div');
    branches.className = 'tree-branches';
    
    const inventory = globalInventory.getItems();
    const itemCounts: Record<string, number> = {};
    inventory.forEach(it => {
       itemCounts[it.baseTemplateId] = (itemCounts[it.baseTemplateId] || 0) + 1;
    });
    
    const recipeReqCounts: Record<string, number> = {};
    recipe.materials.forEach(m => recipeReqCounts[m] = (recipeReqCounts[m] || 0) + 1);
    
    for (const [mId, mCount] of Object.entries(recipeReqCounts)) {
      const hasCount = itemCounts[mId] || 0;
      const mBase = BASE_COMPONENTS[mId];
      if (!mBase) continue;
      
      const isOwned = hasCount >= mCount;
      const leafNode = document.createElement('div');
      leafNode.className = `tree-node tree-node--leaf ${isOwned ? 'owned' : 'missing'}`;
      
      leafNode.innerHTML = `
        <div class="tree-node__icon">${mBase.name.substring(0, 1)}</div>
        <div class="tree-node__name">${mBase.name}</div>
        <div class="tree-node__count">${hasCount}/${mCount}</div>
      `;
      branches.appendChild(leafNode);
    }
    
    tree.append(rootNode, branches);
    this.treeContainer.appendChild(tree);
    
    const craftData = this.availableCrafts.find(c => c.recipe === recipe);
    if (craftData) {
      this.forgeButton.disabled = false;
      this.forgeButton.classList.add('ready');
      this.forgeButton.textContent = '一键熔炼';
    } else {
      this.forgeButton.disabled = true;
      this.forgeButton.classList.remove('ready');
      this.forgeButton.textContent = '材料不足';
    }
  }

  private onForge() {
    if (this.isForging || !this.selectedRecipe) return;
    
    const craftData = this.availableCrafts.find(c => c.recipe === this.selectedRecipe);
    if (!craftData) return;

    this.isForging = true;
    
    this.flashOverlay.style.opacity = '1';
    this.flashOverlay.style.background = 'rgba(255, 255, 255, 0.9)';
    this.root.classList.add('forge-explosion-active');
    
    const allItems = globalInventory.getItems();
    const materialsToConsume = allItems.filter(it => craftData.consumeIds.includes(it.instanceId));
    
    setTimeout(() => {
      const resultItem = RecipesManager.craft(materialsToConsume, craftData.recipe);
      if (resultItem) {
        globalInventory.removeComponents(craftData.consumeIds);
        globalInventory.addComponent(resultItem);
        
        const unlockedSet = this.onGetUnlocked();
        if (!unlockedSet.has(resultItem.baseTemplateId)) {
          this.onUnlock(resultItem.baseTemplateId);
        }
      }

      this.flashOverlay.style.opacity = '0';
      this.root.classList.remove('forge-explosion-active');
      this.isForging = false;
      
      this.refreshState();
    }, 800);
  }

  open() {
    this.root.style.display = 'flex';
    this.isForging = false;
    this.flashOverlay.style.opacity = '0';
    this.refreshState();
  }

  close() {
    this.root.style.display = 'none';
  }
}
