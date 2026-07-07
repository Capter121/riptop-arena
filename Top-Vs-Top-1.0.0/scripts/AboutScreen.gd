extends Node2D

const ClickSfx = preload("res://assets/wav/click.wav")

func _ready():
	$UI/BackButton.pressed.connect(_on_back)
	$UI/ContentPanel/ScrollContainer/VBox/TitleLabel.text = "ABOUT"
	$UI/ContentPanel/ScrollContainer/VBox/SectionGame.text = "> ABOUT THE GAME"
	$UI/ContentPanel/ScrollContainer/VBox/BodyGame.text = "Survive waves of enemy tops in a circular arena. Your spin decays over time. If spin hits 0, you're out. Defeat all enemies each wave to advance."

	$UI/ContentPanel/ScrollContainer/VBox/SectionControls.text = "> CONTROLS"
	$UI/ContentPanel/ScrollContainer/VBox/BodyControls.text = "→ WASD / Arrow Keys — Move (costs spin)\n→ F11 / Alt+Enter — Toggle Fullscreen"

	$UI/ContentPanel/ScrollContainer/VBox/SectionWaves.text = "> WAVES & SCORING"
	$UI/ContentPanel/ScrollContainer/VBox/BodyWaves.text = "Each wave spawns more enemies (+1 every 2 waves). Elite enemies (purple) appear from wave 3.\n\nPoints per kill:\n→ Regular: 75 x wave\n→ Elite: 200 x wave\n\nDefeat all enemies to clear a wave. Between waves, your spin is paused briefly and you get a boost."

	$UI/ContentPanel/ScrollContainer/VBox/SectionSpin.text = "> SPIN"
	$UI/ContentPanel/ScrollContainer/VBox/BodySpin.text = "Your spin: starts at 500, caps at 600. Decays 12/sec base, +20/sec while moving.\n\nCollision cost: you lose 40, enemy loses 50.\n\nSpin meter:\n→ Green: spin > 300 (safe)\n→ Yellow: spin > 150 (warning)\n→ Red: spin < 150 (pulsing danger!)"
	$UI/ContentPanel/ScrollContainer/VBox/BodySpinPickup.text = "Spin Boost: \n→ White ring spawns each wave, lasts 8 sec\n→ +120 boost (capped at 600)\n→ Player only — enemies can't grab it\n→ Next one spawns 2s after pickup"

	$UI/ContentPanel/ScrollContainer/VBox/SectionCreator.text = "> CREATOR"
	$UI/ContentPanel/ScrollContainer/VBox/BodyCreator.text = "Made by Abhinab & Priti"

func _play_click():
	var p = AudioStreamPlayer.new()
	p.stream = ClickSfx
	add_child(p)
	p.play()
	p.finished.connect(p.queue_free)

func _on_back():
	_play_click()
	get_tree().change_scene_to_file("res://scenes/TitleScene.tscn")
