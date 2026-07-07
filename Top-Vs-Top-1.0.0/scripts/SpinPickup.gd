extends Area2D

signal collected

@onready var visual = $Sprite2D

func _ready():
	body_entered.connect(_on_body_entered)
	_animate()
	_start_lifetime_timer()

func _animate():
	var rtween = create_tween().set_loops()
	rtween.tween_property(self, "rotation_degrees", 360, 3.0)
	var ptween = create_tween().set_loops()
	ptween.tween_property(visual, "modulate:a", 0.5, 1.0)
	ptween.tween_property(visual, "modulate:a", 1.0, 1.0)

func _start_lifetime_timer():
	var timer = Timer.new()
	timer.wait_time = 8.0
	timer.one_shot = true
	timer.timeout.connect(_on_lifetime_expired)
	add_child(timer)
	timer.start()

func _on_lifetime_expired():
	var tween = create_tween().set_parallel()
	tween.tween_property(visual, "modulate:a", 0.0, 0.3)
	tween.tween_property(self, "scale", Vector2(0.5, 0.5), 0.3)
	tween.tween_callback(queue_free)

func _on_body_entered(body):
	if body.has_method("boost_spin"):
		body.boost_spin()
		collected.emit()
		var tween = create_tween()
		tween.tween_property(visual, "scale", Vector2(2, 2), 0.1)
		tween.tween_callback(queue_free)
