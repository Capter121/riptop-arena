extends Node2D

const SavePath = "user://highscore.cfg"
const ClickSfx = preload("res://assets/wav/click.wav")

func _ready():
	$UI/PlayButton.pressed.connect(_on_play)
	$UI/AboutButton.pressed.connect(_on_about)
	var hs = _load_high_score()
	if hs > 0:
		$UI/HighScoreLabel.text = "Best: %d" % hs

func _unhandled_input(event):
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F11 or (event.keycode == KEY_ENTER and Input.is_key_pressed(KEY_ALT)):
			_toggle_fullscreen()

func _toggle_fullscreen():
	var mode = DisplayServer.window_get_mode()
	if mode == DisplayServer.WINDOW_MODE_FULLSCREEN:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	else:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_FULLSCREEN)

func _load_high_score() -> int:
	var cfg = ConfigFile.new()
	if cfg.load(SavePath) == OK:
		return cfg.get_value("score", "high", 0)
	return 0

func _play_click():
	var p = AudioStreamPlayer.new()
	p.stream = ClickSfx
	add_child(p)
	p.play()
	p.finished.connect(p.queue_free)

func _on_about():
	_play_click()
	get_tree().change_scene_to_file("res://scenes/AboutScene.tscn")

func _on_play():
	_play_click()
	BgmManager.stop()
	get_tree().change_scene_to_file("res://scenes/Main.tscn")
