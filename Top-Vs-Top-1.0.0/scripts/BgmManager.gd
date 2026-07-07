extends Node

var bgm: AudioStreamPlayer

func _ready():
	bgm = AudioStreamPlayer.new()
	bgm.name = "BgmPlayer"
	bgm.stream = load("res://assets/wav/game-bgm.wav")
	bgm.volume_db = -10
	add_child(bgm)
	bgm.finished.connect(bgm.play)
	bgm.play()

func stop():
	bgm.stop()

func start():
	bgm.play()
