import { PromptNode } from "./PromptNode";
import { ModelSelectorNode } from "./ModelSelectorNode";
import { GenerateNode } from "./GenerateNode";
import { EditNode } from "./EditNode";
import { VideoNode } from "./VideoNode";
import { MultiRefNode } from "./MultiRefNode";
import { ImageOutputNode } from "./ImageOutputNode";
import { VideoOutputNode } from "./VideoOutputNode";

export const nodeTypes = {
  promptNode: PromptNode,
  modelSelectorNode: ModelSelectorNode,
  generateNode: GenerateNode,
  editNode: EditNode,
  videoNode: VideoNode,
  multiRefNode: MultiRefNode,
  imageOutputNode: ImageOutputNode,
  videoOutputNode: VideoOutputNode,
};
