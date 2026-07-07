extends Node2D

const PlayerScene = preload("res://scenes/PlayerTop.tscn")
const EnemyScene = preload("res://scenes/EnemyTop.tscn")
const EliteEnemyScene = preload("res://scenes/EliteEnemyTop.tscn")
const PickupScene = preload("res://scenes/SpinPickup.tscn")
const GameFont = preload("res://assets/fonts/PressStart2P-Regular.ttf")
const SavePath = "user://highscore.cfg"
const ClickSfx = preload("res://assets/wav/click.wav")

@onready var spin_label = $UI/SpinLabel
@onready var score_label = $UI/ScoreLabel
@onready var high_score_label = $UI/HighScoreLabel
@onready var wave_label = $UI/WaveLabel
@onready var wave_notification = $UI/WaveNotification
@onready var game_over_screen = $UI/GameOverScreen
@onready var game_over_label = $UI/GameOverScreen/GameOverPanel/VBox/GameOverTitle
@onready var game_over_stats = $UI/GameOverScreen/GameOverPanel/VBox/GameOverStats
@onready var restart_button = $UI/GameOverScreen/GameOverPanel/VBox/RestartButton
@onready var title_button = $UI/GameOverScreen/GameOverPanel/VBox/TitleButton
@onready var game_layer = $GameLayer
@onready var camera_pivot = $CameraPivot
@onready var low_health_vignette = $UI/LowHealthVignette
@onready var enemy_stats_container = $UI/EnemyStats

var score: int = 0
var high_score: int = 0
var wave: int = 1
var enemies_alive: int = 0
var enemy_index: int = 0
var player: Node2D = null
var arena_center = Vector2(0, 0)
var arena_radius = 260.0
var spin_label_pulse_tween: Tween = null

var sounds: Dictionary = {}
var bgm_player: AudioStreamPlayer = null
var enemy_stat_labels: Dictionary = {}

func _ready():
	game_over_screen.visible = false
	wave_notification.visible = false
	_load_high_score()
	high_score_label.text = "BEST: %d" % high_score
	_init_sounds()
	_spawn_ambient_particles()
	_start_wave()
	bgm_player.play()

func _init_sounds():
	for snd in ["hit", "pickup", "player_death", "enemy_death", "wave_clear", "wave_start"]:
		var p = AudioStreamPlayer.new()
		p.name = snd
		p.stream = load("res://assets/wav/" + snd + ".wav")
		p.bus = &"Master"
		add_child(p)
		sounds[snd] = p

	bgm_player = AudioStreamPlayer.new()
	bgm_player.name = "BGM"
	bgm_player.stream = load("res://assets/wav/bgm.wav")
	bgm_player.bus = &"Master"
	add_child(bgm_player)
	bgm_player.finished.connect(bgm_player.play)

func play_sfx(snd: String):
	var p = sounds.get(snd) as AudioStreamPlayer
	if p:
		p.pitch_scale = randf_range(0.9, 1.1)
		p.play()

func _process(_delta):
	_update_ui()

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

func _update_ui():
	if player and is_instance_valid(player) and not player.is_dead:
		var sp = int(player.spin_speed)
		spin_label.text = "SPIN: %d" % sp
		if player.spin_speed < 150:
			spin_label.modulate = Color.RED
			_start_spin_label_pulse()
			_show_vignette()
		elif player.spin_speed < 300:
			spin_label.modulate = Color.YELLOW
			_stop_spin_label_pulse()
			_hide_vignette()
		else:
			spin_label.modulate = Color.GREEN
			_stop_spin_label_pulse()
			_hide_vignette()
	score_label.text = "Score: %d" % score
	wave_label.text = "Wave %d" % wave
	_update_enemy_stats()

func _show_vignette():
	if low_health_vignette.modulate.a < 0.3:
		var tween = create_tween()
		tween.tween_property(low_health_vignette, "modulate", Color(0.8, 0.0, 0.0, 0.35), 0.3)

func _hide_vignette():
	if low_health_vignette.modulate.a > 0:
		var tween = create_tween()
		tween.tween_property(low_health_vignette, "modulate", Color(0.8, 0.0, 0.0, 0.0), 0.3)

func _start_spin_label_pulse():
	if spin_label_pulse_tween and spin_label_pulse_tween.is_running():
		return
	spin_label_pulse_tween = create_tween().set_loops()
	spin_label_pulse_tween.tween_property(spin_label, "scale", Vector2(1.05, 1.05), 0.25)
	spin_label_pulse_tween.tween_property(spin_label, "scale", Vector2(1.0, 1.0), 0.25)

func _stop_spin_label_pulse():
	if spin_label_pulse_tween and spin_label_pulse_tween.is_running():
		spin_label_pulse_tween.kill()
		spin_label_pulse_tween = null
		spin_label.scale = Vector2.ONE

func _update_enemy_stats():
	for enemy in enemy_stat_labels:
		if is_instance_valid(enemy):
			var sp = int(enemy.spin_speed)
			var label = enemy_stat_labels[enemy] as Label
			var max_sp = enemy.get_meta("spawn_spin", 480)
			var prefix = "E" if not enemy.get_meta("is_elite", false) else "EL"
			label.text = "%s%d: %d / %d" % [prefix, enemy.get_meta("spawn_idx", 0), sp, max_sp]
			if enemy.get_meta("is_elite", false):
				if sp < max_sp * 0.3:
					label.modulate = Color(0.8, 0.2, 0.3)
				elif sp < max_sp * 0.6:
					label.modulate = Color(0.8, 0.5, 0.8)
				else:
					label.modulate = Color(0.7, 0.3, 1.0)
			else:
				if sp < max_sp * 0.3:
					label.modulate = Color.RED
				elif sp < max_sp * 0.6:
					label.modulate = Color.YELLOW
				else:
					label.modulate = Color.WHITE

func _load_high_score():
	var cfg = ConfigFile.new()
	if cfg.load(SavePath) == OK:
		high_score = cfg.get_value("score", "high", 0)

func _save_high_score():
	if score > high_score:
		high_score = score
		var cfg = ConfigFile.new()
		cfg.set_value("score", "high", high_score)
		cfg.save(SavePath)

func _start_wave():
	play_sfx("wave_start")
	wave_label.text = "Wave %d" % wave
	_show_wave_notification("Wave %d" % wave)

	var enemy_total = 1 + floori((wave - 1) / 2.0)
	var elite_count = max(0, min(enemy_total - 1, floori(wave / 3.0)))
	var red_count = enemy_total - elite_count

	var enemy_spin = 480.0 + (wave - 1) * 40.0
	var enemy_force = 350.0 + (wave - 1) * 25.0
	var enemy_decay = max(6.0, 12.0 - (wave - 1) * 1.0)

	if not player or not is_instance_valid(player):
		player = PlayerScene.instantiate()
		player.position = arena_center
		player.add_to_group("player")
		game_layer.add_child(player)
		player.player_died.connect(_on_player_died)
		player.player_hit.connect(_on_player_hit)
		player.spin_speed = 0
		_animate_spin_recovery(player.max_spin * 0.6)
	else:
		player.decay_paused = false
		var boost = int(player.spin_speed * 1.0)
		player.spin_speed = min(player.spin_speed + boost, player.max_spin)
		_show_spin_popup(player.position + Vector2(0, -50), boost)

	var wave_str = "Wave " + str(wave) + " ("
	wave_str += str(enemy_total) + " enemies)"
	if elite_count > 0:
		wave_str += " [ELITE x%d]" % elite_count
	wave_label.text = wave_str

	enemies_alive = enemy_total
	for i in range(red_count):
		_spawn_enemy(false, enemy_spin, enemy_force, enemy_decay)
	for i in range(elite_count):
		_spawn_enemy(true, enemy_spin * 1.5 + 100, enemy_force * 1.2, max(3.0, enemy_decay * 0.6))

	_spawn_pickup()

func _animate_spin_recovery(target: float):
	var start_spin = player.spin_speed
	var diff = target - start_spin
	if diff <= 0:
		player.spin_speed = target
		return
	var tween = create_tween().set_parallel(true)
	tween.tween_method(func(v): if is_instance_valid(player): player.spin_speed = v, start_spin, target, 0.6).set_ease(Tween.EASE_OUT)
	_show_spin_popup(arena_center + Vector2(0, -40), int(diff))

func _show_spin_popup(pos: Vector2, amount: int):
	var label = Label.new()
	label.text = "+%d SPIN" % amount
	label.modulate = Color(0.3, 1.0, 0.7)
	label.position = pos - Vector2(40, 0)
	label.add_theme_font_override("font", GameFont)
	label.add_theme_font_size_override("font_size", 20)
	game_layer.add_child(label)
	var tween = create_tween().set_parallel(true)
	tween.tween_property(label, "position", label.position + Vector2(0, -60), 0.8)
	tween.tween_property(label, "modulate:a", 0.0, 0.8)
	tween.tween_callback(label.queue_free)

func _on_player_hit():
	_screen_shake(8, 6)
	play_sfx("hit")

func _spawn_enemy(elite: bool, enemy_spin: float, enemy_force: float, enemy_decay: float):
	var enemy = EliteEnemyScene.instantiate() if elite else EnemyScene.instantiate()
	var pos: Vector2
	var attempts = 0
	while attempts < 10:
		var angle = randf() * TAU
		var dist = randf_range(100, arena_radius - 40)
		pos = arena_center + Vector2(cos(angle), sin(angle)) * dist
		if not player or pos.distance_to(player.position) > 100:
			break
		attempts += 1
	enemy.position = pos
	enemy.spin_speed = enemy_spin
	enemy.move_force = enemy_force
	enemy.spin_decay = enemy_decay
	enemy.set_meta("spawn_spin", enemy_spin)
	enemy_index += 1
	enemy.set_meta("spawn_idx", enemy_index)
	enemy.set_meta("is_elite", elite)
	game_layer.add_child(enemy)
	enemy.enemy_died.connect(_on_enemy_died.bind(enemy))
	var label = Label.new()
	var prefix = "E" if not elite else "EL"
	label.text = "%s%d: %d" % [prefix, enemy_index, int(enemy_spin)]
	if elite:
		label.modulate = Color(0.7, 0.3, 1.0)
	label.add_theme_font_override("font", GameFont)
	label.add_theme_font_size_override("font_size", 16)
	enemy_stats_container.add_child(label)
	enemy_stat_labels[enemy] = label

func _on_enemy_died(enemy):
	var is_elite = enemy.get_meta("is_elite", false)
	var points = (200 if is_elite else 75) * wave
	score += points
	enemies_alive -= 1
	_show_score_popup(enemy.position, points)
	_show_shockwave(enemy.position)
	play_sfx("enemy_death")
	if enemy_stat_labels.has(enemy):
		enemy_stat_labels[enemy].queue_free()
		enemy_stat_labels.erase(enemy)
	if enemies_alive <= 0:
		_next_wave()

func _show_shockwave(pos: Vector2):
	var ring = Polygon2D.new()
	var pts = PackedVector2Array()
	var segs = 32
	for i in range(segs):
		var a = (2 * PI * i) / segs
		pts.append(Vector2(cos(a), sin(a)) * 5)
	ring.polygon = pts
	ring.color = Color(1.0, 1.0, 1.0, 0.6)
	ring.position = pos
	game_layer.add_child(ring)
	var tween = create_tween().set_parallel(true)
	tween.tween_property(ring, "scale", Vector2(8, 8), 0.4)
	tween.tween_property(ring, "modulate:a", 0.0, 0.4)
	tween.tween_callback(ring.queue_free)

func _next_wave():
	play_sfx("wave_clear")
	_show_wave_notification("WAVE CLEAR!")
	if player and is_instance_valid(player) and not player.is_dead:
		player.decay_paused = true
		player.move_force *= 1.5
	await get_tree().create_timer(1.5).timeout
	wave += 1
	_show_wave_notification("WAVE %d INCOMING!" % wave)
	await get_tree().create_timer(1.0).timeout
	_clear_all_enemies()
	_clear_pickups()
	_start_wave()

func _clear_all_enemies():
	for child in game_layer.get_children():
		if child.is_in_group("tops") and child != player:
			child.queue_free()
	for label in enemy_stat_labels.values():
		label.queue_free()
	enemy_stat_labels.clear()

func _on_player_died():
	spin_label.text = "SPIN: 0"
	play_sfx("player_death")
	_save_high_score()
	_show_game_over()

func _show_game_over():
	game_over_screen.visible = true
	bgm_player.stop()
	var best = max(score, high_score)
	game_over_label.text = "GAME OVER"
	game_over_stats.text = "Score:  %d\nWave:  %d\nBest:  %d" % [score, wave, best]
	_screen_shake(15, 10)

func _screen_shake(intensity: float = 15.0, frames: int = 10):
	var tween = create_tween()
	for i in range(frames):
		tween.tween_property(camera_pivot, "position",
			Vector2(randf_range(-intensity, intensity), randf_range(-intensity, intensity)), 0.05)
	tween.tween_property(camera_pivot, "position", Vector2.ZERO, 0.1)

func _show_score_popup(pos: Vector2, amount: int):
	var label = Label.new()
	label.text = "+%d" % amount
	label.modulate = Color(1.0, 0.85, 0.1)
	label.position = pos - Vector2(20, 0)
	label.add_theme_font_override("font", GameFont)
	label.add_theme_font_size_override("font_size", 20)
	game_layer.add_child(label)
	var tween = create_tween().set_parallel(true)
	tween.tween_property(label, "position", label.position + Vector2(0, -60), 0.6)
	tween.tween_property(label, "modulate:a", 0.0, 0.6)
	tween.tween_callback(label.queue_free)

func _show_wave_notification(text: String):
	wave_notification.text = text
	wave_notification.visible = true
	wave_notification.scale = Vector2(0.7, 0.7)
	var nc = wave_notification.modulate
	nc.a = 1.0
	wave_notification.modulate = nc
	var tween = create_tween().set_parallel(true)
	tween.tween_property(wave_notification, "scale", Vector2(1.0, 1.0), 0.2).set_ease(Tween.EASE_OUT)
	tween.tween_property(wave_notification, "modulate:a", 0.0, 1.5).set_delay(0.3)
	tween.tween_callback(func(): wave_notification.visible = false)

func _spawn_ambient_particles():
	var particles = GPUParticles2D.new()
	particles.amount = 60
	particles.lifetime = 6.0
	particles.one_shot = false
	particles.explosiveness = 0.0
	particles.position = arena_center
	particles.process_material = _make_ambient_material()
	add_child(particles)
	particles.emitting = true

func _spawn_pickup():
	if not player or not is_instance_valid(player) or player.is_dead:
		return
	var pickup = PickupScene.instantiate()
	var pos: Vector2
	var attempts = 0
	while attempts < 20:
		var angle = randf() * TAU
		var dist = randf_range(60, arena_radius - 40)
		pos = arena_center + Vector2(cos(angle), sin(angle)) * dist
		var ok = true
		if player and pos.distance_to(player.position) < 120:
			ok = false
		if ok:
			for c in game_layer.get_children():
				if c.is_in_group("pickup") and c.position.distance_to(pos) < 120:
					ok = false
					break
		if ok:
			break
		attempts += 1
	pickup.position = pos
	game_layer.add_child(pickup)
	pickup.collected.connect(_on_pickup_collected)

func _on_pickup_collected():
	play_sfx("pickup")
	if player and is_instance_valid(player) and not player.is_dead and not _is_game_over():
		var t = Timer.new()
		t.name = "NextPickup"
		t.wait_time = 2.0
		t.one_shot = true
		t.timeout.connect(_spawn_pickup)
		t.timeout.connect(t.queue_free)
		add_child(t)
		t.start()

func _is_game_over() -> bool:
	return game_over_screen.visible

func _clear_pickups():
	for c in game_layer.get_children():
		if c.is_in_group("pickup"):
			c.queue_free()

func _make_ambient_material():
	var mat = ParticleProcessMaterial.new()
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	mat.emission_sphere_radius = 280.0
	mat.initial_velocity_min = 2.0
	mat.initial_velocity_max = 8.0
	mat.gravity = Vector3.ZERO
	mat.scale_min = 0.5
	mat.scale_max = 1.5
	mat.color = Color(0.5, 0.7, 1.0, 0.3)
	mat.lifetime_randomness = 0.8
	return mat

func _play_click():
	var p = AudioStreamPlayer.new()
	p.stream = ClickSfx
	add_child(p)
	p.play()
	p.finished.connect(p.queue_free)

func _on_restart_button_pressed():
	_play_click()
	get_tree().reload_current_scene()

func _on_title_button_pressed():
	_play_click()
	BgmManager.start()
	get_tree().change_scene_to_file("res://scenes/TitleScene.tscn")
