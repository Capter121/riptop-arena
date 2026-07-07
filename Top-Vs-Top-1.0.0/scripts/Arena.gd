extends StaticBody2D

@export var radius: float = 300.0
@export var segments: int = 64

var outer_ring: Polygon2D
var decor_dots: Array = []

func _ready() -> void:
	_build_arena()
	_animate_glow()

func _build_arena():
	var points = PackedVector2Array()
	for i in range(segments):
		var a = (2 * PI * i) / segments
		points.append(Vector2(cos(a), sin(a)) * radius)

	# Arena floor
	var poly = $Polygon2D
	poly.polygon = points
	poly.color = Color(0.2, 0.25, 0.45)

	# Radial rings (denser = more floor detail)
	for r in [50, 100, 150, 200, 250]:
		var ring_points = PackedVector2Array()
		var s = 20 if r < 150 else 40
		for i in range(s):
			var a = (2 * PI * i) / s
			ring_points.append(Vector2(cos(a), sin(a)) * r)
		var ring = Polygon2D.new()
		ring.polygon = ring_points
		ring.color = Color(0.3, 0.35, 0.55, 0.12)
		add_child(ring)

	# Center glow dot
	var center_dot = Polygon2D.new()
	var cd_pts = PackedVector2Array()
	for i in range(16):
		var a = (2 * PI * i) / 16
		cd_pts.append(Vector2(cos(a), sin(a)) * 8)
	center_dot.polygon = cd_pts
	center_dot.color = Color(0.4, 0.7, 1.0, 0.3)
	add_child(center_dot)

	# Decorative lights around the perimeter
	for i in range(16):
		var a = (2 * PI * i) / 16
		var d_pos = Vector2(cos(a), sin(a)) * (radius - 6)
		var dot = Polygon2D.new()
		var dp = PackedVector2Array()
		for j in range(8):
			var ba = (2 * PI * j) / 8
			dp.append(Vector2(cos(ba), sin(ba)) * 3)
		dot.polygon = dp
		dot.color = Color(0.5, 0.8, 1.0, 0.25)
		dot.position = d_pos
		add_child(dot)
		decor_dots.append(dot)

	# Outer glow ring (pulsing)
	outer_ring = Polygon2D.new()
	var outer_points = PackedVector2Array()
	for i in range(segments):
		var a = (2 * PI * i) / segments
		outer_points.append(Vector2(cos(a), sin(a)) * (radius + 8))
	outer_ring.polygon = outer_points
	outer_ring.color = Color(0.3, 0.6, 1.0, 0.4)
	add_child(outer_ring)

	# Collision wall
	var col = $CollisionPolygon2D
	col.polygon = points
	col.build_mode = CollisionPolygon2D.BUILD_SEGMENTS

func _process(delta):
	_pulse_decor_dots(delta)

var decor_time: float = 0.0

func _pulse_decor_dots(delta):
	decor_time += delta
	for i in range(decor_dots.size()):
		var offset = (i * 0.15)
		var a = 0.15 + 0.2 * (sin(decor_time * 1.5 + offset) * 0.5 + 0.5)
		var c = decor_dots[i].color
		c.a = a
		decor_dots[i].color = c

func _animate_glow():
	var tween = create_tween().set_loops()
	tween.tween_method(_set_glow_alpha, 0.2, 0.5, 1.5)
	tween.tween_method(_set_glow_alpha, 0.5, 0.2, 1.5)

func _set_glow_alpha(a: float):
	if outer_ring:
		var c = outer_ring.color
		c.a = a
		outer_ring.color = c
