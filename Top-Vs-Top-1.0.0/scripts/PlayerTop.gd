extends RigidBody2D

@export var max_spin: float = 600.0
@export var spin_decay: float = 12.0
@export var move_force: float = 800.0
@export var boost_amount: float = 120.0
@export var move_spin_cost: float = 20.0

var spin_speed: float = 500.0
var is_dead: bool = false
var decay_paused: bool = false

@onready var trail = $Trail
@onready var top_visual = $Sprite2D
@onready var spin_ring: Node2D = $SpinRing
@onready var spin_sfx: AudioStreamPlayer = $SpinSfx

signal player_died
signal player_hit

func _ready():
	_setup_trail()
	_setup_spin_ring()
	_setup_spin_sound()

func _setup_trail():
	trail.emitting = true
	trail.amount = 32
	trail.lifetime = 0.4
	trail.explosiveness = 0.0
	trail.process_material = _make_trail_material()

func _make_trail_material():
	var mat = ParticleProcessMaterial.new()
	mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	mat.emission_sphere_radius = 20.0
	mat.initial_velocity_min = 10.0
	mat.initial_velocity_max = 30.0
	mat.gravity = Vector3.ZERO
	mat.scale_min = 3.0
	mat.scale_max = 8.0
	mat.color = Color(0.3, 0.7, 1.0, 0.6)
	return mat

func _setup_spin_ring():
	var count = 10
	var ring_r = 28.0
	for i in range(count):
		var a = (2.0 * PI * i) / count
		var dot = Polygon2D.new()
		var pts = PackedVector2Array()
		var w = 3.0
		var h = 1.5
		pts.append(Vector2(-w / 2, -h / 2))
		pts.append(Vector2(w / 2, -h / 2))
		pts.append(Vector2(w / 2, h / 2))
		pts.append(Vector2(-w / 2, h / 2))
		dot.polygon = pts
		dot.color = Color(1, 1, 1, 0.3)
		dot.position = Vector2(cos(a), sin(a)) * ring_r
		dot.rotation = a
		spin_ring.add_child(dot)
		var tween = create_tween().set_loops()
		tween.tween_property(dot, "modulate:a", 0.7, 0.4)
		tween.tween_property(dot, "modulate:a", 0.2, 0.4)
	var rtween = create_tween().set_loops()
	rtween.tween_property(spin_ring, "rotation", TAU, 1.0)

func _setup_spin_sound():
	spin_sfx.stream = load("res://assets/wav/spin_loop.wav")
	spin_sfx.volume_db = -18
	spin_sfx.play()

func _physics_process(delta):
	if is_dead:
		return
	_handle_movement(delta)
	_decay_spin(delta)
	_check_death()

func _handle_movement(delta):
	var dir = Vector2.ZERO
	if Input.is_action_pressed("ui_right") or Input.is_key_pressed(KEY_D):
		dir.x += 1
	if Input.is_action_pressed("ui_left") or Input.is_key_pressed(KEY_A):
		dir.x -= 1
	if Input.is_action_pressed("ui_down") or Input.is_key_pressed(KEY_S):
		dir.y += 1
	if Input.is_action_pressed("ui_up") or Input.is_key_pressed(KEY_W):
		dir.y -= 1
	if dir != Vector2.ZERO:
		apply_central_force(dir.normalized() * move_force)
		spin_speed -= move_spin_cost * delta

func _decay_spin(delta):
	if decay_paused:
		return
	spin_speed -= spin_decay * delta
	spin_speed = max(spin_speed, 0)

func _check_death():
	if spin_speed <= 0:
		_die()

func _die():
	if is_dead:
		return
	is_dead = true
	_explode()
	trail.emitting = false
	spin_sfx.stop()
	spin_ring.visible = false
	emit_signal("player_died")
	var tween = create_tween()
	tween.tween_property(top_visual, "modulate", Color.RED, 0.15)
	tween.tween_property(top_visual, "modulate:a", 0.0, 0.3)
	tween.tween_callback(queue_free)

func boost_spin():
	spin_speed = min(spin_speed + boost_amount, max_spin)

func _on_body_entered(body):
	if body.is_in_group("tops"):
		var knock_dir = (position - body.position).normalized()
		apply_central_impulse(knock_dir * 500)
		apply_torque_impulse(randf_range(-3000, 3000))
		spin_speed -= 40
		_hit_flash()
		emit_signal("player_hit")

func _hit_flash():
	var tween = create_tween()
	tween.tween_property(top_visual, "modulate", Color(3, 3, 3), 0.0)
	tween.tween_property(top_visual, "modulate", Color.WHITE, 0.05)

func _explode():
	var explosion = CPUParticles2D.new()
	explosion.amount = 20
	explosion.lifetime = 0.5
	explosion.one_shot = true
	explosion.explosiveness = 1.0
	explosion.initial_velocity_min = 100.0
	explosion.initial_velocity_max = 200.0
	explosion.gravity = Vector2.ZERO
	explosion.color = Color(0.3, 0.7, 1.0)
	explosion.scale_amount_min = 4.0
	explosion.scale_amount_max = 8.0
	explosion.position = position
	get_parent().add_child(explosion)
	explosion.emitting = true
