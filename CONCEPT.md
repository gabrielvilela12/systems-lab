# Systems Lab

A shared study hub now introduces two runnable laboratories. HTTP uses a workstation, request/response tracks, latency instrument and a three-drawer server rack. Its model owns request snapshots, server-side side effects, client outcomes, phase timing and challenge completion. A timeout ends the client's wait while the server can still process and mutate its data. The diagram is paused by reduced motion and supports manual steps. Future modules are marked as planned and have no pretend navigation.

## The message machine

A cartridge feeder publishes to a geared routing turntable; an accumulator stores ready work; three serial stamping benches reserve messages up to prefetch; successful stamps send ACK, failed stamps return a cartridge or place it in an open dead-letter drawer.

The TypeScript model is independent of React and all counts, moving cartridges, consumer activity, plots and logs derive from it. The figure is illustrative AMQP 0-9-1, not connected to a live broker.

The accumulator represents three independently dispatchable logical queues. Colored cartridges identify orders, payments and notifications. A weighted producer mix (or one selected type) determines new publications. A subscription matrix determines which active workers compete on each queue. No eligible subscriber means accumulation, not rejection. Color controls change the visual identity of each type without changing its routing. Subscription changes apply to future dispatch; assigned work finishes normally. The prefetch readout is a shared application budget across a worker's subscriptions.

Physical parts, authored before geometry: four foot flanges and four rubber feet; beveled chassis, edge groove, corner fasteners, calibration rail and ruler ticks; feeder plinth, body, four magazine posts, four caps, magazine back, seven blank cartridges, press crossbeam, feed motor and knurl; conveyor mounts, beds, individual treads and guides; exchange mounting plate, bearing, routing wheel, radial detents, hub, two gate mounts and caps; accumulator bed, treads, guides, two supports, two overhead bridges, front legs and sight ruler; three processing bench feet, chambers, top panels, six actuator pillars, three crossheads, fifteen cooling fins, three knurled knobs and three intake buffers; branching delivery bed, retry belt, inlet riser and return outlet; dead-letter floor, two sidewalls, two end walls and drawer pull.

Retry attempts are a demonstrator's application policy. NACK with requeue=true immediately requeues; its animation represents the redelivery journey. After the configured retry limit, requeue=false routes through a configured DLX to orders.dead. The UI makes that assumption explicit. Redrive is manual and preserves the invalid payload. Per-consumer prefetch limits outstanding deliveries, while each worker processes serially. Lowering prefetch does not revoke deliveries already in flight. Channel closure requeues unacknowledged deliveries.

Sources: https://www.rabbitmq.com/docs/confirms, https://www.rabbitmq.com/docs/consumer-prefetch, https://www.rabbitmq.com/docs/dlx
