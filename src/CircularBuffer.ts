export default class CircularBuffer {
  private buffer: Buffer;
  private writePosition: number = 0;
  private readPosition: number = 0;
  private isBufferFull: boolean = false;

  constructor(private size: number) {
    this.buffer = Buffer.alloc(size);
  }

  public write(data: Buffer): void {
    data.forEach((byte) => {
      this.buffer[this.writePosition] = byte;
      this.writePosition = (this.writePosition + 1) % this.size;

      // If write overtook read position, move read position forward
      if (this.writePosition === this.readPosition) {
        this.readPosition = (this.readPosition + 1) % this.size;
        this.isBufferFull = true;
      }
    });
  }
  public readLiveContent(): Buffer {
    // If the buffer isn't full and nothing was written yet, return an empty buffer
    if (!this.isBufferFull && this.writePosition === this.readPosition) {
      return Buffer.alloc(0);
    }
  
    let contentSize;
    if (this.isBufferFull) {
      contentSize = this.size; // If buffer is full, we want to read the whole buffer
    } else {
      // Calculate the size of the content from the read position to the write position
      contentSize = this.writePosition >= this.readPosition
        ? this.writePosition - this.readPosition
        : this.size - this.readPosition + this.writePosition;
    }
  
    const liveContent = Buffer.alloc(contentSize);
    let cur = this.readPosition;
    for (let i = 0; i < liveContent.length; i++) {
      liveContent[i] = this.buffer[cur];
      cur = (cur + 1) % this.size; // Move to the next byte in the buffer
    }
  
    // We do not update the readPosition here because it represents the "live" point
  
    return liveContent;
  }

  public readCurrentContent(): Buffer {
    if (!this.isBufferFull && this.writePosition === this.readPosition) {
      // Buffer is empty
      return Buffer.alloc(0);
    }

    let end;
    if (this.isBufferFull || this.writePosition < this.readPosition) {
      end = this.size;
    } else {
      end = this.writePosition;
    }

    const currentContent = Buffer.alloc(end - this.readPosition);
    let cur = this.readPosition;
    for (let i = 0; i < currentContent.length; i++) {
      currentContent[i] = this.buffer[cur];
      cur = (cur + 1) % this.size;
    }

    // Set up for the next read
    this.readPosition = this.writePosition;
    this.isBufferFull = false;

    return currentContent;
  }
}