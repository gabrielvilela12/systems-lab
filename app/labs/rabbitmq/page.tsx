import { HubNav } from "../../../components/hub-nav";
import { MachineArt } from "../../../components/machine-art";
import { MessageMachine } from "../../../components/message-machine";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "RabbitMQ · Systems Lab" };
export default function RabbitLab() {
  return (
    <div className="rabbit-lab">
      <HubNav active="rabbitmq" />
      <MessageMachine art={<MachineArt key="machine-art" />} />
    </div>
  );
}
