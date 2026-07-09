export class CutinPanel {
  public readonly root: HTMLElement;
  private readonly bgLayer: HTMLElement;
  private readonly charLayer: HTMLElement;
  private readonly textLayer: HTMLElement;
  
  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'cutin-panel';
    this.root.dataset.active = 'false';

    this.bgLayer = document.createElement('div');
    this.bgLayer.className = 'cutin-panel__bg';
    
    this.charLayer = document.createElement('div');
    this.charLayer.className = 'cutin-panel__char';
    // Using the image we copied to public
    this.charLayer.style.backgroundImage = `url('/character_cutin.jpg')`;
    
    this.textLayer = document.createElement('div');
    this.textLayer.className = 'cutin-panel__text';
    
    this.root.append(this.bgLayer, this.charLayer, this.textLayer);
    document.body.appendChild(this.root);
  }

  showCutin(skillName: string, skillId?: string): Promise<void> {
    return new Promise((resolve) => {
      this.textLayer.textContent = skillName;
      
      // Update character image based on skill
      if (skillId === 'wind_blade') {
        this.charLayer.style.backgroundImage = `url('/wind_blade_character.jpg')`;
      } else if (skillId === 'aqua_surge') {
        this.charLayer.style.backgroundImage = `url('/aqua_surge_character.jpg')`;
      } else if (skillId === 'blazing_meteor') {
        this.charLayer.style.backgroundImage = `url('/blazing_meteor_character.jpg')`;
      } else if (skillId === 'phantom_clone') {
        this.charLayer.style.backgroundImage = `url('/phantom_clone_character.jpg')`;
      } else {
        this.charLayer.style.backgroundImage = `url('/character_cutin.jpg')`;
      }

      this.root.dataset.active = 'true';
      
      // The CSS animation will handle the visuals, we just wait for the duration
      // Duration is 1.2 seconds
      setTimeout(() => {
        this.root.dataset.active = 'false';
        // Add a slight buffer after closing before returning control
        setTimeout(resolve, 200); 
      }, 1200);
    });
  }
}
