import { MachineArt } from "../components/machine-art";
import { MessageMachine } from "../components/message-machine";
export default function Page() {
  return <MessageMachine art={<MachineArt key="machine-art" />} />;
}
